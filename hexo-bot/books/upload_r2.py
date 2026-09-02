#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""上传 books/data/ 到 Cloudflare R2 公开桶（零依赖：纯标准库 + AWS SigV4）。
相比 boto3 版本：无需 pip install，py -3 直接跑。

用法：
  py -3 upload_r2.py                 # 增量同步（按 md5+size 跳过未变文件）
  py -3 upload_r2.py --force        # 忽略比对，全量重传
  py -3 upload_r2.py --index-only   # 只传 index.json
  py -3 upload_r2.py --dry-run      # 只列出待传，不实际上传
  py -3 upload_r2.py --prefix books # 对象 key 加前缀（如 books/xxx.json）

配置：环境变量 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET /
      R2_PUBLIC_URL，或同目录 r2_config.json（已 gitignore，勿提交）。
"""
import os
import re
import sys
import json
import time
import hashlib
import hmac
import datetime
import urllib.request
import urllib.parse
import urllib.error
import xml.etree.ElementTree as ET
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, 'data')
CONFIG_PATH = os.path.join(HERE, 'r2_config.json')
DELAY = 0.05


# ----------------------------- 配置 -----------------------------
def load_config():
    cfg = {
        'account_id': os.environ.get('R2_ACCOUNT_ID', ''),
        'access_key': os.environ.get('R2_ACCESS_KEY_ID', ''),
        'secret_key': os.environ.get('R2_SECRET_ACCESS_KEY', ''),
        'bucket': os.environ.get('R2_BUCKET', ''),
        'public_url': os.environ.get('R2_PUBLIC_URL', ''),
    }
    if os.path.exists(CONFIG_PATH):
        try:
            cfg.update(json.load(open(CONFIG_PATH, encoding='utf-8')))
        except Exception as e:
            print('[WARN] 读取 r2_config.json 失败:', e)
    return cfg


# ----------------------------- AWS SigV4 -----------------------------
def _hmac(key, msg):
    return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()


def _sha256_hex(data):
    if isinstance(data, str):
        data = data.encode('utf-8')
    return hashlib.sha256(data).hexdigest()


def _sign_v4(method, host, path, query, body, ak, sk, region='auto', service='s3', extra=None):
    """返回带 Authorization 的 headers 字典（含 host/x-amz-*/Authorization）。"""
    now = datetime.datetime.now(datetime.timezone.utc)
    amzdate = now.strftime('%Y%m%dT%H%M%SZ')
    datestamp = now.strftime('%Y%m%d')
    payload_hash = _sha256_hex(body)
    hdrs = {'host': host, 'x-amz-content-sha256': payload_hash, 'x-amz-date': amzdate}
    if extra:
        hdrs.update(extra)
    keys = sorted(hdrs.keys(), key=lambda s: s.lower())
    canonical_headers = ''.join('%s:%s\n' % (k.lower(), str(hdrs[k]).strip()) for k in keys)
    signed_headers = ';'.join(k.lower() for k in keys)
    # canonical query
    qitems = []
    for k in sorted(query.keys()):
        qitems.append('%s=%s' % (
            urllib.parse.quote(k, safe=''),
            urllib.parse.quote(str(query[k]), safe='')))
    canonical_query = '&'.join(qitems)
    canonical_uri = urllib.parse.quote(path, safe='/-')
    canonical_request = '\n'.join(
        [method, canonical_uri, canonical_query, canonical_headers, signed_headers, payload_hash])
    scope = '/'.join([datestamp, region, service, 'aws4_request'])
    string_to_sign = '\n'.join(['AWS4-HMAC-SHA256', amzdate, scope, _sha256_hex(canonical_request)])
    k = _hmac(('AWS4' + sk).encode('utf-8'), datestamp)
    k = _hmac(k, region)
    k = _hmac(k, service)
    k = _hmac(k, 'aws4_request')
    sig = hmac.new(k, string_to_sign.encode('utf-8'), hashlib.sha256).hexdigest()
    auth = ('AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s'
            % (ak, scope, signed_headers, sig))
    hdrs['Authorization'] = auth
    return hdrs


def _request(cfg, method, path, query=None, body=b'', extra_headers=None, timeout=60):
    query = query or {}
    host = '%s.r2.cloudflarestorage.com' % cfg['account_id']
    hdrs = _sign_v4(method, host, path, query, body,
                    cfg['access_key'], cfg['secret_key'], extra=extra_headers)
    qs = ''
    if query:
        qs = '?' + '&'.join('%s=%s' % (
            urllib.parse.quote(k, safe=''),
            urllib.parse.quote(str(query[k]), safe='')) for k in sorted(query))
    url = 'https://%s%s%s' % (host, path, qs)
    data = body if method != 'GET' else None
    req = urllib.request.Request(url, data=data, method=method)
    for k, v in hdrs.items():
        req.add_header(k, v)
    return urllib.request.urlopen(req, timeout=timeout)


S3_NS = '{http://s3.amazonaws.com/doc/2006-03-01/}'


def list_objects(cfg, prefix=''):
    """返回 {key: (etag_md5, size)}。单 part 上传的 ETag 即内容 MD5。"""
    existing = {}
    cont = None
    while True:
        q = {'list-type': '2'}
        if prefix:
            q['prefix'] = prefix
        if cont:
            q['continuation-token'] = cont
        try:
            resp = _request(cfg, 'GET', '/%s' % cfg['bucket'], query=q)
            xml = resp.read().decode('utf-8')
        except urllib.error.HTTPError as e:
            print('[WARN] 列举桶失败:', e.code, e.read().decode('utf-8', 'ignore')[:300])
            break
        root = ET.fromstring(xml)
        for c in root.iter(S3_NS + 'Contents'):
            key = c.findtext(S3_NS + 'Key')
            etag = (c.findtext(S3_NS + 'ETag') or '').strip('"')
            try:
                size = int(c.findtext(S3_NS + 'Size') or '0')
            except ValueError:
                size = 0
            if key:
                existing[key] = (etag, size)
        if root.findtext(S3_NS + 'IsTruncated') != 'true':
            break
        cont = root.findtext(S3_NS + 'NextContinuationToken')
        if not cont:
            break
    return existing


def put_object(cfg, key, data, content_type='application/json; charset=utf-8'):
    body = data if isinstance(data, bytes) else data.encode('utf-8')
    _request(cfg, 'PUT', '/%s/%s' % (cfg['bucket'], key),
             body=body, extra_headers={'Content-Type': content_type})


def upload_worker(f, cfg, existing, opts, prefix):
    """单文件上传工作单元。返回 (status, key, info)，status ∈ ok|skip|dry|fail。"""
    local = os.path.join(DATA_DIR, f)
    key = (prefix + '/' + f) if prefix else f
    data = open(local, 'rb').read()
    size = len(data)
    md5 = hashlib.md5(data).hexdigest()
    if not opts.force and key in existing:
        e_tag, e_size = existing[key]
        if e_tag == md5 and e_size == size:
            return ('skip', key, size)
    if opts.dry_run:
        return ('dry', key, size)
    try:
        put_object(cfg, key, data)
        return ('ok', key, size)
    except urllib.error.HTTPError as e:
        return ('fail', key, (e.code, e.read().decode('utf-8', 'ignore')[:200]))
    except Exception as e:
        return ('fail', key, str(e))


# ----------------------------- 主流程 -----------------------------
def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--index-only', action='store_true', help='只传 index.json')
    ap.add_argument('--toc', action='store_true', help='传索引 + 全部 toc.json，跳过正文分片(cNN.json)')
    ap.add_argument('--force', action='store_true', help='忽略比对，全量重传')
    ap.add_argument('--dry-run', action='store_true', help='只列出待传，不上传')
    ap.add_argument('--prefix', default='', help='对象 key 前缀，如 books')
    ap.add_argument('--workers', type=int, default=10, help='并发上传线程数（默认 10，与爬虫一致）')
    opts = ap.parse_args()

    cfg = load_config()
    miss = [k for k in ('account_id', 'access_key', 'secret_key', 'bucket') if not cfg.get(k)]
    if miss:
        print('[ERR] 缺少 R2 配置: %s。请填 r2_config.json 或设置环境变量 R2_*' % ','.join(miss))
        sys.exit(2)
    if not os.path.isdir(DATA_DIR):
        print('[ERR] 数据目录不存在:', DATA_DIR)
        sys.exit(2)

    prefix = opts.prefix.strip('/')
    # 递归收集（含 data/<id>/cNN.json 正文分片），key 用相对路径
    all_files = []
    for root, dirs, fnames in os.walk(DATA_DIR):
        for fn in fnames:
            if fn.endswith('.json'):
                full = os.path.join(root, fn)
                rel = os.path.relpath(full, DATA_DIR).replace(os.sep, '/')
                all_files.append(rel)
    all_files.sort()
    files = all_files
    if opts.index_only:
        files = [f for f in files if f == 'index_meta.json' or f == 'all_book_ids.json' or f.startswith('index_cat_')]
    if opts.toc:
        # 只传索引 + 各书 toc.json，排除正文分片 cNN.json（不含正文）
        files = [f for f in files if not re.match(r'^c\d+\.json$', os.path.basename(f))]
    files.sort()
    print('[INFO] 待处理 %d 个文件 (dry=%s, force=%s)' % (len(files), opts.dry_run, opts.force))

    existing = {}
    if not opts.force:
        print('[INFO] 列举桶内已有对象以做增量比对...')
        existing = list_objects(cfg, prefix=prefix)

    ok = skip = fail = 0
    total = len(files)
    done = 0

    def tally(st, key, info):
        nonlocal ok, skip, fail
        if st == 'ok':
            ok += 1
        elif st == 'skip':
            skip += 1
        elif st == 'dry':
            ok += 1
        else:
            fail += 1
            print('  [FAIL] %s: %s' % (key, info))

    def progress():
        nonlocal done
        done += 1
        if done % 200 == 0 or done == total:
            pct = done * 100.0 / total if total else 100
            print('  [进度] %d/%d (%.1f%%)  OK:%d SKIP:%d FAIL:%d' % (done, total, pct, ok, skip, fail), flush=True)

    if opts.workers <= 1:
        for f in files:
            st, key, info = upload_worker(f, cfg, existing, opts, prefix)
            tally(st, key, info)
            progress()
    else:
        with ThreadPoolExecutor(max_workers=opts.workers) as ex:
            futs = [ex.submit(upload_worker, f, cfg, existing, opts, prefix) for f in files]
            for fut in as_completed(futs):
                st, key, info = fut.result()
                tally(st, key, info)
                progress()
    print('[DONE] 上传成功 %d，跳过 %d，失败 %d' % (ok, skip, fail))
    if cfg.get('public_url'):
        print('[INFO] 公开访问基址: %s/' % cfg['public_url'].rstrip('/'))


if __name__ == '__main__':
    main()
