#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""清空 Cloudflare R2 公开桶中所有对象（零依赖：纯标准库 + AWS SigV4）。

用法：
  py -3 purge_r2.py            # 列出并删除桶内全部对象
  py -3 purge_r2.py --dry-run  # 仅列出，不删除

注意：删除不可逆，但 books 数据均可由 lewx.cc.books.py 重新抓取。
配置同 upload_r2.py（r2_config.json 或 R2_* 环境变量）。
"""
import os
import sys
import json
import time
import datetime
import hashlib
import hmac
import urllib.request
import urllib.parse
import urllib.error
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, 'r2_config.json')
S3_NS = '{http://s3.amazonaws.com/doc/2006-03-01/}'


# ----------------------------- AWS SigV4 -----------------------------
def _hmac(key, msg):
    return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()


def _sha256_hex(data):
    if isinstance(data, str):
        data = data.encode('utf-8')
    return hashlib.sha256(data).hexdigest()


def _sign_v4(method, host, path, query, body, ak, sk, region='auto', service='s3', extra=None):
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


def list_objects(cfg, prefix=''):
    out = []
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
            print('[WARN] 列举失败:', e.code, e.read().decode('utf-8', 'ignore')[:300])
            break
        root = ET.fromstring(xml)
        for c in root.iter(S3_NS + 'Contents'):
            key = c.findtext(S3_NS + 'Key')
            if key:
                out.append(key)
        if root.findtext(S3_NS + 'IsTruncated') != 'true':
            break
        cont = root.findtext(S3_NS + 'NextContinuationToken')
        if not cont:
            break
    return out


def delete_batch(cfg, keys):
    """批量删除（单请求最多 1000 个）。返回成功删除数。"""
    root = ET.Element('Delete')
    for k in keys:
        obj = ET.SubElement(root, 'Object')
        key_el = ET.SubElement(obj, 'Key')
        key_el.text = k
    body = ET.tostring(root, encoding='utf-8')
    try:
        resp = _request(cfg, 'POST', '/%s' % cfg['bucket'],
                        query={'delete': ''}, body=body,
                        extra_headers={'Content-Type': 'application/xml'})
        resp.read()
        return len(keys)
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', 'ignore')[:400]
        print('  [FAIL] 批量删除失败: %s %s' % (e.code, detail), flush=True)
        return 0


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true', help='仅列出，不删除')
    opts = ap.parse_args()

    cfg = {}
    if os.path.exists(CONFIG_PATH):
        try:
            cfg.update(json.load(open(CONFIG_PATH, encoding='utf-8')))
        except Exception as e:
            print('[WARN] 读取 r2_config.json 失败:', e)
    for envk, ck in (('R2_ACCOUNT_ID', 'account_id'), ('R2_ACCESS_KEY_ID', 'access_key'),
                     ('R2_SECRET_ACCESS_KEY', 'secret_key'), ('R2_BUCKET', 'bucket')):
        if not cfg.get(ck) and os.environ.get(envk):
            cfg[ck] = os.environ[envk]
    miss = [k for k in ('account_id', 'access_key', 'secret_key', 'bucket') if not cfg.get(k)]
    if miss:
        print('[ERR] 缺少 R2 配置: %s' % ','.join(miss))
        sys.exit(2)

    print('[INFO] 目标桶: %s  (%s.r2.cloudflarestorage.com)'
          % (cfg['bucket'], cfg['account_id']), flush=True)
    print('[INFO] 正在列举对象...', flush=True)
    keys = list_objects(cfg)
    print('[INFO] 桶内对象总数: %d' % len(keys), flush=True)

    if opts.dry_run:
        for k in keys[:60]:
            print('   ', k)
        if len(keys) > 60:
            print('   ... 另有 %d 个' % (len(keys) - 60))
        print('[DRY-RUN] 未执行任何删除。')
        return

    if not keys:
        print('[INFO] 桶已为空，无需操作。')
        return

    batch = 1000
    deleted = 0
    total = len(keys)
    for i in range(0, total, batch):
        chunk = keys[i:i + batch]
        for attempt in range(4):
            n = delete_batch(cfg, chunk)
            deleted += n
            if n == len(chunk):
                break
            print('  [重试] 本批 %d/%d 成功，1s 后重试' % (n, len(chunk)), flush=True)
            time.sleep(1.0)
        pct = min(i + len(chunk), total) * 100.0 / total
        print('  [进度] %d/%d (%.1f%%)' % (min(i + len(chunk), total), total, pct), flush=True)

    print('[DONE] 已删除 %d 个对象。' % deleted, flush=True)
    remaining = list_objects(cfg)
    print('[VERIFY] 剩余对象: %d' % len(remaining), flush=True)


if __name__ == '__main__':
    main()
