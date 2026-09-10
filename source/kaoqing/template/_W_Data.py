#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
_W_Data.py —— 把 kaoqing 的记录写进「出勤状况汇总表」

用法：
    python _W_Data.py                 写入当前「待审核」的记录
    python _W_Data.py --dry-run       只算不写，打印将要写入的明细（强烈建议先跑这个）
    python _W_Data.py --status 已审核  指定状态（默认 待审核）
    python _W_Data.py --month 2026-09 只处理某个月

写入规则（与汇总表现有手工填法一致）：
    加班 → 该日格上下两行合并，写正数小时（如 8.5）
    请假 → 上行写假别字（年/调/病/事/其/独），下行写负数小时（如 -8）
    同一人同一天多条 → 同类累加；既有加班又有请假 → 判为冲突，跳过并报告

只写 xlsx，不改 Waline 里任何记录。写前自动备份到同目录 _备份/。
"""

import os
import re
import sys
import time
import html
import json
import base64
import shutil
import zipfile
import datetime
import collections
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(HERE, '出勤状况汇总表.xlsx')
BACKUP_DIR = os.path.join(HERE, '_备份')

# Waline（与 kaoqing.html 同源；令牌按页内的混淆算法还原，不落明文）
WALINE_SERVER = 'https://waline.snowhoo.net'
RECORDS_PATH = '/kaoqing/records'
_TK_SEED = '8kQ~zL#'
_TK_OBF = 'CA4WRzEWZlo5Og8xCkpdHgZHLhh8Xg8CGhgdYggKIkgeKFVUPT0VDn0ObkUAM1R1aVElYDcAGWpyAh4XGQtBUCEoGw=='


def token():
    b = base64.b64decode(_TK_OBF)
    return ''.join(chr(b[i] ^ ord(_TK_SEED[i % len(_TK_SEED)])) for i in range(len(b)))[::-1]


# 类别 → 汇总表里的假别字（写在上行）；不在表里的归到「其它」
LEAVE_MARK = {
    '年假': '年', 'nianjia': '年',
    '调休': '调', 'tiaoxiu': '调',
    '病假': '病', 'bingjia': '病',
    '事假': '事', 'shijia': '事',
    '独生子女陪护假': '独', 'dushengzinv': '独',
    '居家办公': '居', 'jujiabanngong': '居',
    '其它': '其', 'qita': '其',
}
OT_CAT = {'overtime', '加班', 'jiaban'}


# ============================== 基础工具 ==============================
def colname(n):
    s = ''
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def colnum(s):
    n = 0
    for ch in s:
        n = n * 26 + ord(ch) - 64
    return n


def wait_unlock(path, timeout=90, step=3):
    end = time.time() + timeout
    while time.time() < end:
        try:
            f = open(path, 'r+b'); f.close(); return True
        except Exception:
            time.sleep(step)
    return False


def read_zip(path):
    z = zipfile.ZipFile(path)
    it = {n: z.read(n) for n in z.namelist()}
    z.close()
    return it


def write_zip(path, items):
    tmp = path + '.tmp'
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as out:
        for n, d in items.items():
            out.writestr(n, d)
    os.replace(tmp, path)


# ============================== 读 Waline ==============================
def fetch_all(path):
    tk = token()
    out, page = [], 1
    while True:
        url = (WALINE_SERVER + '/api/comment?type=list&url=' + urllib.parse.quote(path, safe='')
               + '&page=%d&pageSize=100' % page)
        req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + tk})
        j = json.loads(urllib.request.urlopen(req, timeout=30).read().decode('utf-8'))
        dd = (j.get('data') or {}).get('data') or []
        if not dd:
            break
        out.extend(dd)
        if len(dd) < 100:
            break
        page += 1
        if page > 80:
            break
    return out


def clean_comment(raw):
    """评论 HTML → 事件 dict。Waline 存的是 <p> 包裹、引号被转成全角的 JSON。"""
    s = raw or ''
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = re.sub(r'</?p[^>]*>', '', s)
    s = html.unescape(s)
    s = (s.replace('\u201c', '"').replace('\u201d', '"').replace('\u201e', '"')
           .replace('\u2018', "'").replace('\u2019', "'"))
    i, j = s.find('{'), s.rfind('}')
    if i < 0 or j < 0:
        return None
    try:
        return json.loads(s[i:j + 1])
    except Exception:
        return None


def load_records(status='待审核'):
    evs = [o for o in (clean_comment(c.get('comment')) for c in fetch_all(RECORDS_PATH)) if o]
    latest = {}
    for e in evs:
        r = e.get('rec') or e.get('record')
        if not isinstance(r, dict) or not r.get('id'):
            continue
        if e.get('op') == 'del':
            latest.pop(r['id'], None)
        else:
            latest[r['id']] = r
    return [r for r in latest.values() if (not status or r.get('status') == status)]


# ============================== 工作表读写 ==============================
ROW_RE = re.compile(r'<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)</row>')
CELL_RE = re.compile(r'<c r="([A-Z]+\d+)"[^>]*?/>|<c r="([A-Z]+\d+)"[^>]*?>[\s\S]*?</c>')


def cells_of(xml):
    """{ref: (col, style, has_value, is_text)}"""
    d = {}
    for m in re.finditer(r'<c r="([A-Z]+\d+)"([^>]*?)(?:/>|>([\s\S]*?)</c>)', xml):
        ref, attr, inner = m.group(1), m.group(2), m.group(3) or ''
        mm = re.match(r'([A-Z]+)(\d+)', ref)
        st = re.search(r's="(\d+)"', attr)
        d[ref] = (colnum(mm.group(1)), st.group(1) if st else None,
                  bool(re.search(r'<v>', inner)) or 't="inlineStr"' in attr,
                  't="s"' in attr or 't="inlineStr"' in attr)
    return d


def row_style_map(xml, day_cols):
    """为日列准备样式后备：按列号取该列上已有格子的样式（同列同底色/边框）。"""
    m = {}
    for ref, (c, st, hasv, _t) in cells_of(xml).items():
        if st and c in day_cols and c not in m:
            m[c] = st
    return m


def rebuild_row(row_inner, newcell, target_col):
    """把 newcell 按列序插入 row_inner。"""
    cells = [(colnum(re.match(r'([A-Z]+)', re.search(r'r="([A-Z]+\d+)"', m.group(0)).group(1)).group(1)), m.group(0))
             for m in CELL_RE.finditer(row_inner)]
    inserted = False
    out = []
    for c, xml in cells:
        if not inserted and c > target_col:
            out.append(newcell); inserted = True
        out.append(xml)
    if not inserted:
        out.append(newcell)
    # 找到第一个 cell 的起点，保留其之前的空白
    first = CELL_RE.search(row_inner)
    head = row_inner[:first.start()] if first else ''
    return head + ''.join(out)


def set_merge(x, refs_to_add, refs_to_remove):
    m = re.search(r'<mergeCells count="(\d+)">([\s\S]*?)</mergeCells>', x)
    if not m:
        return x
    refs = re.findall(r'ref="([^"]+)"', m.group(2))
    refs = [r for r in refs if r not in refs_to_remove]
    for r in refs_to_add:
        if r not in refs:
            refs.append(r)
    body = ''.join('<mergeCell ref="%s"/>' % r for r in refs)
    return x[:m.start()] + '<mergeCells count="%d">%s</mergeCells>' % (len(refs), body) + x[m.end():]


def existing_merges(x):
    m = re.search(r'<mergeCells[^>]*>([\s\S]*?)</mergeCells>', x)
    return set(re.findall(r'ref="([^"]+)"', m.group(1))) if m else set()


# ============================== 主流程 ==============================
def main(argv):
    dry = '--dry-run' in argv
    status = '待审核'
    if '--status' in argv:
        status = argv[argv.index('--status') + 1]
    only_month = argv[argv.index('--month') + 1] if '--month' in argv else None

    print('读取 Waline「%s」记录…' % status)
    recs = load_records(status)
    print('共 %d 条' % len(recs))
    if not recs:
        print('没有符合条件的记录。')
        return 0

    if not os.path.exists(XLSX):
        print('找不到汇总表：%s' % XLSX)
        return 1
    if not dry and not wait_unlock(XLSX):
        print('汇总表被占用（Excel 打开中），请先关闭。')
        return 1

    items = read_zip(XLSX)
    rd = lambda n: items[n].decode('utf-8', 'replace')
    wb = rd('xl/workbook.xml')
    sheets = re.findall(r'<sheet name="([^"]*)"[^>]*r:id="(rId\d+)"', wb)
    rel_map = dict((mm.group(1), mm.group(2)) for mm in
                   re.finditer(r'Id="(rId\d+)"[^>]*Target="([^"]*)"', rd('xl/_rels/workbook.xml.rels')))
    sheet_of = {}
    for nm, rid in sheets:
        sheet_of[nm] = 'xl/' + rel_map[rid].lstrip('/')
    print('工作簿中的表：%s' % '、'.join(n for n, _ in sheets))

    # 按月分组 → 聚合到 (人, 日)
    plan = collections.defaultdict(lambda: collections.defaultdict(lambda: {'ot': 0.0, 'lv': []}))
    skipped = []
    for r in recs:
        date = r.get('date') or ''
        if not date:
            skipped.append((r, '无日期')); continue
        month = date[:7]
        if only_month and month != only_month:
            continue
        if month not in sheet_of:
            skipped.append((r, '汇总表没有 %s 这张表' % month)); continue
        people = r.get('people') or []
        if not people:
            skipped.append((r, '无人员')); continue
        try:
            day = int(date[8:10])
        except Exception:
            skipped.append((r, '日期异常')); continue
        cat = r.get('catId') or r.get('catName')
        name = people[0]
        hours = float(r.get('hours') or 0)
        key = (month, name, day)
        if cat in OT_CAT or (r.get('catName') == '加班'):
            plan[month][(name, day)]['ot'] += hours
        else:
            mark = LEAVE_MARK.get(cat) or LEAVE_MARK.get(r.get('catName')) or '其'
            plan[month][(name, day)]['lv'].append((mark, hours, r))

    # 逐月写入
    report, conflicts = [], []
    for month, agg in sorted(plan.items()):
        sp = sheet_of[month]
        x = rd(sp)
        # 人员行：B 列姓名 → 行号
        who = {}
        for m in re.finditer(r'<c r="(B\d+)"([^>]*?)(?:/>|>([\s\S]*?)</c>)', x):
            ref, attr, inner = m.group(1), m.group(2), m.group(3) or ''
            if 't="s"' not in attr and 't="inlineStr"' not in attr:
                continue
            vm = re.search(r'<v>([\s\S]*?)</v>', inner or '')
            tm = re.search(r'<t[^>]*>([\s\S]*?)</t>', inner or '')
            nm = None
            if vm:
                nm = sst[int(vm.group(1))]
            elif tm:
                nm = tm.group(1)
            if nm:
                who[nm] = int(ref[1:])
        merges = existing_merges(x)
        styles = row_style_map(x, set(range(3, 34)))

        writes = []          # (row, col, kind, value, mark)
        for (name, day), v in sorted(agg.items(), key=lambda kv: (kv[0][1], kv[0][0])):
            row = who.get(name)
            if not row:
                conflicts.append('%s %s日 %s：汇总表里找不到这个人' % (month, day, name)); continue
            col = 2 + day
            if not (3 <= col <= 33):
                conflicts.append('%s %s日 %s：日期列越界' % (month, day, name)); continue
            if v['ot'] and v['lv']:
                conflicts.append('%s %s日 %s：同一天既有加班(%sh)又有请假，需人工处理' %
                                 (month, day, name, v['ot'])); continue
            if v['ot']:
                writes.append((row, col, 'ot', round(v['ot'], 2), None))
            elif v['lv']:
                marks = set(m for m, _h, _r in v['lv'])
                if len(marks) > 1:
                    conflicts.append('%s %s日 %s：同一天多种假别 %s，按第一种写入' %
                                     (month, day, name, '、'.join(sorted(marks))))
                mk, tot = v['lv'][0][0], round(sum(h for _m, h, _r in v['lv']), 2)
                writes.append((row, col, 'lv', tot, mk))

        if not writes:
            report.append('%s：无需写入' % month)
            continue

        # 执行写入
        rows = dict((int(m.group(1)), m) for m in ROW_RE.finditer(x))
        add_merge, del_merge = [], []
        for row, col, kind, val, mark in writes:
            ref1 = '%s%d' % (colname(col), row)
            ref2 = '%s%d' % (colname(col), row + 1)
            st = styles.get(col)
            if kind == 'ot':
                x = set_cell_in(x, rows, ref1, '<v>%s</v>' % val, st)
                x = set_cell_in(x, rows, ref2, '', st)          # 合并后下行清空
                if ('%s:%s' % (ref1, ref2)) not in merges:
                    add_merge.append('%s:%s' % (ref1, ref2))
                report.append('%s %s %s日 加班 %sh → %s（合并）' % (month, name_of(who, row), val_day(col), val, ref1))
            else:
                if ('%s:%s' % (ref1, ref2)) in merges:          # 请假要占两行，先拆掉合并
                    del_merge.append('%s:%s' % (ref1, ref2))
                x = set_cell_in(x, rows, ref1,
                                '<is><t>%s</t></is>' % mark, st, inline=True)
                x = set_cell_in(x, rows, ref2, '<v>%s</v>' % (-abs(val)), st)
                report.append('%s %s %s日 %s %sh → %s=%s / %s=%s' %
                              (month, name_of(who, row), val_day(col), mark, val, ref1, mark, ref2, -abs(val)))

        x = set_merge(x, add_merge, del_merge)
        items[sp] = x.encode('utf-8')

    print('\n===== 写入计划 / 结果 =====')
    for r in report:
        print('  ' + r)
    if conflicts:
        print('\n===== 需人工处理 =====')
        for c in conflicts:
            print('  ⚠ ' + c)
    if skipped:
        print('\n===== 跳过 =====')
        for r, why in skipped:
            print('  - %s（%s）' % (r.get('docNo') or r.get('id'), why))

    if dry:
        print('\n（--dry-run：未写入文件）')
        return 0
    if not report:
        print('\n没有要写入的内容。')
        return 0

    os.makedirs(BACKUP_DIR, exist_ok=True)
    bak = os.path.join(BACKUP_DIR, '出勤状况汇总表_%s.xlsx' % datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
    shutil.copy2(XLSX, bak)
    print('\n已备份 → %s' % bak)

    if 'xl/calcChain.xml' in items:
        items.pop('xl/calcChain.xml')
        ct = items['[Content_Types].xml'].decode('utf-8')
        ct = re.sub(r'<Override PartName="/xl/calcChain.xml"[^>]*/>', '', ct)
        items['[Content_Types].xml'] = ct.encode('utf-8')
        wr = items['xl/_rels/workbook.xml.rels'].decode('utf-8')
        wr = re.sub(r'<Relationship Id="[^"]*"[^>]*calcChain[^>]*/>', '', wr)
        items['xl/_rels/workbook.xml.rels'] = wr.encode('utf-8')
    if 'fullCalcOnLoad' not in items['xl/workbook.xml'].decode('utf-8'):
        items['xl/workbook.xml'] = items['xl/workbook.xml'].decode('utf-8').replace(
            '<calcPr calcId="191029"/>', '<calcPr calcId="191029" fullCalcOnLoad="1"/>').encode('utf-8')

    ok = True
    for n in items:
        if n.endswith(('.xml', '.rels')):
            try:
                ET.fromstring(items[n])
            except Exception as e:
                print('  ✗ XML 解析失败 %s: %s' % (n, e)); ok = False
    print('  XML 解析：%s' % ('全部 OK' if ok else '失败，未写入'))
    if not ok:
        return 2

    write_zip(XLSX, items)
    print('\n已写回 → %s' % XLSX)
    return 0


# ---- 几个小工具（避免主流程过长）----
sst = []


def val_day(col):
    return col - 2


def name_of(who, row):
    for nm, r in who.items():
        if r == row:
            return nm
    return '?'


def set_cell_in(x, rows, ref, val_xml, style, inline=False):
    """在整张表 XML 里给某行设置单元格。rows 需随修改更新。"""
    rn = int(re.match(r'[A-Z]+(\d+)', ref).group(1))
    if rn not in rows:
        return x
    m = rows[rn]
    inner = m.group(2)
    attr_inline = ' t="inlineStr"' if inline else ''
    if val_xml == '':
        target = '<c r="%s"%s/>' % (ref, ' s="%s"' % style if style else '')
    else:
        target = '<c r="%s"%s%s>%s</c>' % (ref, ' s="%s"' % style if style else '', attr_inline, val_xml)
    if re.search(r'<c r="%s"' % ref, inner):
        newinner = re.sub(r'<c r="%s"[^>]*?/>|<c r="%s"[^>]*?>[\s\S]*?</c>' % (ref, ref),
                          lambda mm: target, inner, count=1)
    else:
        newinner = rebuild_row(inner, target, colnum(re.match(r'([A-Z]+)', ref).group(1)))
    newrow = m.group(0).replace(inner, newinner)
    x = x.replace(m.group(0), newrow, 1)
    rows[rn] = ROW_RE.search(newrow)
    return x


if __name__ == '__main__':
    # 载入 sharedStrings（用于把 B 列姓名从索引还原）
    import io as _io
    _z = zipfile.ZipFile(XLSX)
    _ss = _z.read('xl/sharedStrings.xml').decode('utf-8')
    sst = [''.join(re.findall(r'<t[^>]*>([\s\S]*?)</t>', s))
           for s in re.findall(r'<si>([\s\S]*?)</si>', _ss)]
    _z.close()
    sys.exit(main(sys.argv))
