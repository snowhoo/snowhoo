#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""清空 R2 公开桶（零依赖，复用 upload_r2 的 SigV4 签名）。

用法：
  py -3 purge_r2.py            # 仅预览：列出桶内对象数量与总大小
  py -3 purge_r2.py --yes      # 真正执行：删除桶内全部对象（不可逆）

警告：此脚本会删除当前配置桶下的【所有】对象，不可恢复。
仅用于 books 专用数据桶(snowhoo-net-books-data)的清空重建流程。
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from upload_r2 import load_config, list_objects, _request  # noqa


def _xml_escape(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
             .replace('"', '&quot;').replace("'", '&apos;'))


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--yes', action='store_true', help='真正执行删除（不加则仅预览）')
    ap.add_argument('--batch', type=int, default=1000, help='每批删除对象数（S3 上限 1000）')
    opts = ap.parse_args()

    cfg = load_config()
    miss = [k for k in ('account_id', 'access_key', 'secret_key', 'bucket') if not cfg.get(k)]
    if miss:
        print('[ERR] 缺少 R2 配置: %s。请填 r2_config.json 或设置环境变量 R2_*' % ','.join(miss))
        sys.exit(2)

    print('[INFO] 列举桶 %s 内全部对象...' % cfg['bucket'])
    existing = list_objects(cfg)  # 无 prefix = 整个桶
    keys = list(existing.keys())
    total = sum(s for (_, s) in existing.values())
    print('[INFO] 共 %d 个对象，总大小约 %.2f MB' % (len(keys), total / 1024.0 / 1024.0))

    if not opts.yes:
        print('[PREVIEW] 以上对象将被删除。确认无误请加 --yes 真正执行（不可逆）。')
        return

    bucket = cfg['bucket']
    deleted = 0
    errored = 0
    for i in range(0, len(keys), opts.batch):
        chunk = keys[i:i + opts.batch]
        xml = '<?xml version="1.0" encoding="UTF-8"?>\n<Delete>'
        for k in chunk:
            xml += '<Object><Key>%s</Key></Object>' % _xml_escape(k)
        xml += '</Delete>'
        body = xml.encode('utf-8')
        try:
            resp = _request(cfg, 'POST', '/%s' % bucket, query={'delete': ''},
                            body=body, extra_headers={'Content-Type': 'application/xml'})
            resp.read()
            deleted += len(chunk)
            print('  [删除] %d/%d' % (deleted, len(keys)))
        except Exception as e:
            errored += len(chunk)
            print('  [ERR] 批次 %d 失败: %s' % (i, e))
    print('[DONE] 已删除 %d 个对象，失败 %d 个' % (deleted, errored))


if __name__ == '__main__':
    main()
