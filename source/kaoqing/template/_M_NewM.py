#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
M_NewM.py —— 「出勤状况汇总表」新增月份表工具

用法（命令行）：
    python M_NewM.py 2027-01                 创建 2027 年 1 月表（追加到工作簿末尾）
    python M_NewM.py 2027-02 2027-03         一次创建多个月（按参数顺序追加）
    python M_NewM.py 2027-01 --force         该月已存在时重建（按节假日配置重算第 4 行/标题/年度累计）
    python M_NewM.py 2027-03 --tpl 2026-12   指定用哪张表现有表当模板（默认取最后一张非本月表）
    python M_NewM.py --from-archive         根据「本次归档清单」自动判断：只建工作簿里没有对应表的月份，已有则跳过（默认只读 _archive_this_run.json）
    python M_NewM.py --from-archive-all      按 R2 全部归档判断建表（逃生口，补建历史表用）

它会自动完成：
    1. 按真实日历排第 4 行的 P(平时) / S(双休) / G(国假) / #(该月不存在此日)
    2. 小月（不足 31 天）把不存在的日期列收窄成窄条（宽度 2.25，与 9 月做法一致）
    3. 标题「YYYY年M月出勤状况(工作日:N天)」—— 天数由 COUNTIF 公式自动算，脚本只改月份文字
    4. 年度累计列 AP：1 月（年度起始月）只算当月 = AI；其余月份 = AI + 上一张表!AP
    5. 复制批注文本框、打印设置、登记关系文件与内容类型
    6. 写完后跑「引用完整性 + 业务一致性」校验并打印核对报告

注意：运行前请关闭 Excel（脚本会等待文件释放，最多 90 秒）。
"""

import os
import re
import sys
import time
import shutil
import zipfile
import calendar
import datetime
import xml.etree.ElementTree as ET

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(HERE, '_出勤状况汇总表.xlsx')
BACKUP_DIR = os.path.join(HERE, '_备份')          # 下划线开头，Hexo 不会发布

# =====================================================================
# 节假日配置（按需编辑）
#   格式：'YYYY-MM': { 日: 标记 }
#   标记：'G' = 国假（法定假日）  'S' = 调休放假（本该上班但放）  'P' = 补班（本该休息但上）
#   只需填写「与常规周末不同」的日子；周一~周五默认 P，周六日默认 S。
#   未配置的月份：按常规周末生成，并在报告里提示你人工核对。
# =====================================================================
HOLIDAY_CFG = {
    '2026-01': {1: 'G', 2: 'S', 3: 'S', 4: 'P'},                      # 元旦：1-3 放假，4 日(周日)补班
    '2026-09': {25: 'G'},                                             # 中秋
    '2026-10': {1: 'G', 2: 'G', 3: 'G', 4: 'S', 5: 'S', 6: 'S', 7: 'S'},  # 国庆：1-7 连休
    '2027-01': {1: 'G'},                                              # 元旦（周五），2、3 日本就是周末，不补班
}

SST_IDX = {'G': 28, 'P': 29, 'S': 30, '#': 25}     # sharedStrings 索引（本工作簿固定）


# ============================== 基础工具 ==============================
def colname(n):
    s = ''
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


DAYCOLS = [colname(i) for i in range(3, 34)]        # C..AG（1..31 日）
DAYSET = set(DAYCOLS)


def wait_unlock(path, timeout=90, step=3):
    """等 Excel 释放文件，返回 True 表示可写。"""
    end = time.time() + timeout
    while time.time() < end:
        try:
            f = open(path, 'r+b')
            f.close()
            return True
        except Exception:
            time.sleep(step)
    return False


def read_zip(path):
    z = zipfile.ZipFile(path)
    items = {n: z.read(n) for n in z.namelist()}
    z.close()
    return items


def rel_target(rels_txt, kind):
    """在 .rels 里按类型取 Target（不能取第一个，第一个通常是 printerSettings）。"""
    for mm in re.finditer(r'<Relationship\b([^>]*?)/>', rels_txt):
        a = mm.group(1)
        if kind in a:
            tm = re.search(r'Target="([^"]*)"', a)
            if tm:
                return tm.group(1)
    return None


def write_zip(path, items):
    tmp = path + '.tmp'
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as out:
        for n, data in items.items():
            out.writestr(n, data)
    os.replace(tmp, path)


# ============================== 日历 ==============================
def month_types(y, m):
    """返回 (该月类型列表[31项], 天数)。周一周五=P、周六日=S、不存在日=#，再套用节假日配置。"""
    first_wd, days = calendar.monthrange(y, m)      # first_wd: 0=周一 ... 6=周日
    types = []
    for d in range(1, 32):
        if d > days:
            types.append('#')
        else:
            wd = (first_wd + d - 1) % 7
            types.append('S' if wd >= 5 else 'P')
    cfg = HOLIDAY_CFG.get('%04d-%02d' % (y, m))
    if cfg:
        for d, ch in cfg.items():
            if 1 <= d <= days:
                types[d - 1] = ch
    return types, days, bool(cfg)


# ============================== 列宽（小月收窄）==============================
def fix_cols(cols_xml, days):
    """把 C..AG 的列宽规范化：有效日列 4.5，不存在的日列收窄为 2.25（与 9 月做法一致）。"""
    cols = re.findall(r'<col\b[^>]*/>', cols_xml)
    out, done = [], False
    for c in cols:
        mm = re.search(r'min="(\d+)"', c)
        if mm and 3 <= int(mm.group(1)) <= 33:
            if not done:
                last_valid = 2 + days               # d 日 → 列号 2+d
                if days >= 31:
                    out.append('<col min="3" max="33" width="4.5" customWidth="1"/>')
                else:
                    out.append('<col min="3" max="%d" width="4.5" customWidth="1"/>' % last_valid)
                    out.append('<col min="%d" max="33" width="2.25" customWidth="1"/>' % (last_valid + 1))
                done = True
            continue                                 # 丢掉模板原有的 C..AG 定义
        out.append(c)
    if not done:                                     # 兜底：模板没写 C..AG 段
        last_valid = 2 + days
        if days >= 31:
            out.append('<col min="3" max="33" width="4.5" customWidth="1"/>')
        else:
            out.append('<col min="3" max="%d" width="4.5" customWidth="1"/>' % last_valid)
            out.append('<col min="%d" max="33" width="2.25" customWidth="1"/>' % (last_valid + 1))
    return ''.join(out)


CELL_RE = re.compile(r'<c r="(?P<ref>[A-Z]+\d+)"(?P<attr>[^>]*?)(?:/>|>(?P<inner>[\s\S]*?)</c>)')


def clear_const(m):
    """清空数据区（C..AG 与 AQ，行 5..30）里的常量，公式原样保留。"""
    w, ref, attr, inner = m.group(0), m.group('ref'), m.group('attr'), m.group('inner')
    mm = re.match(r'([A-Z]+)(\d+)', ref)
    if not mm:
        return w
    col, r = mm.group(1), int(mm.group(2))
    if not (5 <= r <= 30):
        return w
    if col not in DAYSET and col != 'AQ':
        return w
    if inner is None or '<f' in inner:
        return w
    sm = re.search(r's="(\d+)"', attr or '')
    return '<c r="%s"%s/>' % (ref, ' s="%s"' % sm.group(1) if sm else '')


# ============================== 生成一张月表 ==============================
def build_sheet(tpl_xml, y, m, prev_name):
    """以模板 sheet XML 为基础，生成 YYYY-MM 的 sheet XML。prev_name 为上月 sheet 名（None=不引用）。"""
    types, days, has_cfg = month_types(y, m)
    x = tpl_xml.decode('utf-8')

    # 1) 标题月份（公式里的文字 + 缓存值里的天数）
    title_new = '%d年%d月出勤状况' % (y, m)
    x = re.sub(r'\d{4}年\d{1,2}月出勤状况', title_new, x)
    workdays = types.count('P')
    x = re.sub(r'(<v>%s\(工作日:)\d+(天\)</v>)' % re.escape(title_new),
               lambda mm: mm.group(1) + str(workdays) + mm.group(2), x)

    # 2) 第 4 行日期类型（只改 <v>，样式与条件格式都不动）
    miss = 0
    for i, ch in enumerate(types):
        pat = re.compile(r'(<c r="%s4"[^>]*>)(<v>)\d+(</v>)(</c>)' % DAYCOLS[i])
        x, n = pat.subn(lambda mm: mm.group(1) + mm.group(2) + str(SST_IDX[ch]) + mm.group(3) + mm.group(4), x, count=1)
        if n != 1:
            miss += 1

    # 3) 年度累计 AP：1 月（年度起始月）只算当月；否则 = AI + 上月!AP
    #    注意：<f> 标签内的公式不带前导等号
    x = re.sub(r"(<f>)AI(\d+)\+'[^']*'!AP\2(</f>)", r"\1AI\2\3", x)      # 先清掉模板里的旧引用
    if prev_name:
        x, nref = re.subn(r"(<f>)AI(\d+)(</f>)", r"\1AI\2+'%s'!AP\2\3" % prev_name, x)
    else:
        nref = 0

    # 4) 小月收窄
    cm = re.search(r'<cols>([\s\S]*?)</cols>', x)
    if cm:
        x = x[:cm.start(1)] + fix_cols(cm.group(1), days) + x[cm.end(1):]

    # 5) 清掉模板可能残留的常量
    x = CELL_RE.sub(clear_const, x)

    return x.encode('utf-8'), types, days, workdays, has_cfg, miss, nref


# ============================== 装配与校验 ==============================
def next_free(items, pattern, start=1):
    nums = [int(mm.group(1)) for n in items for mm in [re.search(pattern, n)] if mm]
    return (max(nums) + 1) if nums else start


def verify(items):
    """引用完整性校验，返回 (是否有错, 报告行列表)。"""
    rep, err = [], 0
    zbuf = {}
    # 用内存字典模拟 zip
    names = set(items)
    rd = lambda n: items[n].decode('utf-8', 'replace')

    for n in [x for x in names if x.endswith('.rels')]:
        base = os.path.dirname(os.path.dirname(n))
        for m in re.finditer(r'<Relationship[^>]*Target="([^"]+)"[^>]*>', rd(n)):
            t = m.group(1)
            if t.startswith(('http', '/')):
                continue
            full = os.path.normpath(os.path.join(base, t)).replace('\\', '/')
            if full not in names:
                rep.append('  ✗ %s 的目标缺失：%s' % (n, t)); err += 1
    rep.append('  · 关系文件目标存在性：%s' % ('OK' if err == 0 else '有问题'))

    wb = rd('xl/workbook.xml')
    ids = set(re.findall(r'Id="([^"]+)"', rd('xl/_rels/workbook.xml.rels')))
    dangling = [r for r in re.findall(r'r:id="([^"]+)"', wb) if r not in ids]
    if dangling:
        rep.append('  ✗ workbook r:id 悬空：%s' % dangling); err += 1

    for sp in sorted([x for x in names if re.match(r'xl/worksheets/sheet\d+\.xml$', x)],
                     key=lambda s: int(re.search(r'(\d+)', s).group(1))):
        rp = 'xl/worksheets/_rels/%s.rels' % os.path.basename(sp)
        used = set(re.findall(r'r:id="([^"]+)"', rd(sp)))
        have = set(re.findall(r'Id="([^"]+)"', rd(rp))) if rp in names else set()
        if used - have:
            rep.append('  ✗ %s 的 r:id 悬空：%s' % (sp, sorted(used - have))); err += 1
    if not dangling:
        rep.append('  · 各表 r:id 引用：OK')

    bad = 0
    for n in names:
        if n.endswith(('.xml', '.rels')):
            try:
                ET.fromstring(items[n])
            except Exception as e:
                rep.append('  ✗ XML 解析失败 %s: %s' % (n, e)); bad += 1
    rep.append('  · XML 解析：%s' % ('全部 OK' if bad == 0 else '%d 个失败' % bad))
    return (err == 0 and bad == 0), rep


def report_sheet(items, sheetfile, y, m):
    """打印新表的核对信息。"""
    rd = lambda n: items[n].decode('utf-8', 'replace')
    ss = rd('xl/sharedStrings.xml')
    SST = [''.join(re.findall(r'<t[^>]*>([\s\S]*?)</t>', s)) for s in re.findall(r'<si>([\s\S]*?)</si>', ss)]
    x = rd(sheetfile)
    d, nf = {}, 0
    for mm in re.finditer(r'<c r="([A-Z]+\d+)"([^>]*?)(?:/>|>([\s\S]*?)</c>)', x):
        ref, attr, inner = mm.group(1), mm.group(2), mm.group(3) or ''
        t = 's' if 't="s"' in attr else 'n'
        fm = re.search(r'<f[^>]*>([\s\S]*?)</f>', inner)
        vm = re.search(r'<v>([\s\S]*?)</v>', inner)
        v = ''
        if t == 's' and vm:
            v = SST[int(vm.group(1))]
        elif vm:
            v = vm.group(1)
        if fm:
            v = '=' + (fm.group(1) or ''); nf += 1
        if v:
            d[ref] = v
    line = ''.join(d.get(c + '4', '?') for c in DAYCOLS)
    print('    ── %04d-%02d 核对 ──' % (y, m))
    print('    第4行 C..AG : %s' % line)
    print('    统计        : P(平时)=%d  S(双休)=%d  G(国假)=%d  #(不存在)=%d' %
          (line.count('P'), line.count('S'), line.count('G'), line.count('#')))
    print('    标题        : %s' % d.get('C2'))
    print('    年度累计 AP : %s   （末位人员 %s）' % (d.get('AP5'), d.get('AP29')))
    print('    跨表引用    : %s' % (sorted(set(re.findall(r"'([^']+)'!", x))) or '无'))
    print('    公式格/人员 : %d 个 / %d 人' % (nf, len([1 for r in range(5, 32, 2) if d.get('B%d' % r)])))
    ne = [c + str(r) for r in range(5, 31) for c in DAYCOLS if (c + str(r)) in d and not d[c + str(r)].startswith('=')]
    print('    数据区      : %s' % ('空表 ✓' if not ne else '有残留 %s' % ne[:5]))


# ============================== R2 归档发现 ==============================
def discover_archive_months(names):
    """扫描 R2 归档目录(kaoqing-archive/)，返回「工作簿中尚无对应表」的月份列表(升序)。

    仅依赖 R2 凭证(复用 D:/hexo/hexo-bot/books/r2_config.json)。"""
    sys.path.insert(0, r"D:\hexo\hexo-bot\books")
    try:
        import upload_r2
    except Exception as e:
        print("[ERR] 无法导入 upload_r2（R2 模块）：%s" % e)
        return []
    cfg = upload_r2.load_config()
    miss = [k for k in ("account_id", "access_key", "secret_key", "bucket") if not cfg.get(k)]
    if miss:
        print("[ERR] 缺少 R2 配置: %s（请检查 D:/hexo/hexo-bot/books/r2_config.json）" % ",".join(miss))
        return []
    try:
        keys = upload_r2.list_objects(cfg, prefix="kaoqing-archive/")
    except Exception as e:
        print("[ERR] 列举 R2 归档失败: %s" % e)
        return []
    months = set()
    for k in keys:
        m = re.match(r"kaoqing-archive/(\d{4}-\d{2})(_\d+)?\.json$", k)
        if m:
            months.add(m.group(1))
    return sorted(mm for mm in months if mm not in names)


# ============================== 主流程 ==============================
def main(argv):
    args = [a for a in argv[1:] if not a.startswith('--')]
    force = '--force' in argv
    from_archive = '--from-archive' in argv
    tpl_name = None
    if '--tpl' in argv:
        i = argv.index('--tpl')
        if i + 1 < len(argv):
            tpl_name = argv[i + 1]

    if not os.path.exists(XLSX):
        print('找不到汇总表：%s' % XLSX)
        return 1
    if not wait_unlock(XLSX):
        print('汇总表被占用（Excel 打开中），请先关闭后重跑。')
        return 1

    items = read_zip(XLSX)
    rd = lambda n: items[n].decode('utf-8', 'replace')
    wb = rd('xl/workbook.xml')
    sheets = re.findall(r'<sheet name="([^"]*)" sheetId="(\d+)" r:id="(rId\d+)"', wb)
    names = [s[0] for s in sheets]
    print('现有表：%s' % '、'.join(names))

    # --from-archive：认「本次归档清单」建表，只建工作簿里还没有对应表的月份
    #   （默认只读 _archive_this_run.json；--from-archive-all 才扫 R2 全部归档，作补建历史表用）
    if from_archive:
        if '--from-archive-all' in argv:
            disc = discover_archive_months(names)
            src = 'R2 全部归档'
        else:
            man = os.path.join(HERE, '_archive_this_run.json')
            if not os.path.exists(man):
                print('[from-archive] 找不到本次归档清单 %s（本次可能未运行 _archiver.py）。' % man)
                print('        如需按 R2 全部归档建表，请加 --from-archive-all 重新运行。')
                return 0
            try:
                _mdata = json.load(open(man, encoding='utf-8'))
            except Exception as e:
                print('[ERR] 读取本次归档清单失败: %s' % e)
                return 1
            _months = _mdata.get('months') or []
            if not _months:
                print('[from-archive] 本次归档清单为空（_archiver.py 未归档任何文件），无新表可建。')
                return 0
            disc = [m for m in _months if m not in names]
            src = '本次归档清单'
        if not disc:
            print('[from-archive] %s中无需要新建的月份，未改动文件。' % src)
            return 0
        args = disc
        print('[from-archive] 将根据%s新建：%s' % (src, '、'.join(args)))

    if not args:
        print(__doc__)
        return 1

    os.makedirs(BACKUP_DIR, exist_ok=True)
    bak = os.path.join(BACKUP_DIR, '出勤状况汇总表_%s.xlsx' % datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
    shutil.copy2(XLSX, bak)
    print('已备份 → %s' % bak)

    wbrels = rd('xl/_rels/workbook.xml.rels')
    rel_map = dict((mm.group(1), mm.group(2)) for mm in re.finditer(r'Id="(rId\d+)"[^>]*Target="([^"]*)"', wbrels))

    tgt_sheet_no = next_free(items, r'worksheets/sheet(\d+)\.xml$')
    tgt_draw_no = next_free(items, r'drawings/drawing(\d+)\.xml$')
    next_rid = next_free({('rId%d' % 0): 1}, r'rId(\d+)')  # 占位，下面重算
    rid_nums = [int(mm.group(1)) for mm in re.finditer(r'Id="rId(\d+)"', wbrels)]
    next_rid = max(rid_nums) + 1
    sid_nums = [int(s[1]) for s in sheets]
    next_sid = max(sid_nums) + 1

    changed = False
    for ym in args:
        mm = re.match(r'^(\d{4})-(\d{1,2})$', ym.strip())
        if not mm:
            print('× 参数格式应为 YYYY-MM，跳过：%s' % ym)
            continue
        y, m = int(mm.group(1)), int(mm.group(2))
        name = '%04d-%02d' % (y, m)

        # 目标是否已存在
        exist = [s for s in sheets if s[0] == name]
        if exist and not force:
            print('× %s 已存在（加 --force 可重建），跳过' % name)
            continue

        # 上月表名（1 月为年度起始月，不引用）
        prev_ym = '%04d-%02d' % (y - 1, 12) if m == 1 else '%04d-%02d' % (y, m - 1)
        prev_name = prev_ym if (m != 1 and (prev_ym in names or prev_ym in [n for n in args[:args.index(ym)]])) else None
        if m == 1:
            prev_name = None

        # 模板：--tpl 指定 / 最后一张非本月表 / 最后一张
        if tpl_name:
            cand = [s for s in sheets if s[0] == tpl_name]
            if not cand:
                print('× 指定的模板表不存在：%s' % tpl_name); continue
            tpl_path = 'xl/' + rel_map[cand[0][2]].lstrip('/')
        else:
            cand = [s for s in sheets if s[0] != name]
            tpl_path = 'xl/' + rel_map[(cand[-1] if cand else sheets[-1])[2]].lstrip('/')
        print('\n→ %s（模板：%s，年度累计引用：%s）' % (name, os.path.basename(tpl_path), prev_name or '不引用(年度起始月/无前表)'))

        xml, types, days, workdays, has_cfg, miss, nref = build_sheet(items[tpl_path], y, m, prev_name)

        if exist:
            # 重建：直接覆盖原 part，位置与编号不变
            sname, sid, rid = exist[0]
            tgt = 'xl/' + rel_map[rid].lstrip('/')
            items[tgt] = xml
            dpath = re.search(r'Target="([^"]*)"', rd('xl/worksheets/_rels/%s.rels' % os.path.basename(tgt)))
            print('   已重建（覆盖 %s）' % os.path.basename(tgt))
        else:
            # 新增
            sf = 'xl/worksheets/sheet%d.xml' % tgt_sheet_no
            df = 'xl/drawings/drawing%d.xml' % tgt_draw_no
            rid = 'rId%d' % next_rid
            items[sf] = xml
            # 批注文本框（复制模板那张的；按类型取，别取到 printerSettings）
            tpl_rels = rd('xl/worksheets/_rels/%s.rels' % os.path.basename(tpl_path))
            dt = rel_target(tpl_rels, 'drawing')
            if dt:
                dpath_full = os.path.normpath(os.path.join('xl/worksheets', dt)).replace('\\', '/')
                if dpath_full in items:
                    dd = items[dpath_full].decode('utf-8')
                    dd = re.sub(r'id="\{[0-9A-Fa-f\-]+\}"',
                                'id="{%s}"' % ('%08x-0000-0000-0000-000000000000' % (tgt_draw_no * 7)), dd)
                    items[df] = dd.encode('utf-8')
                    has_draw = True
                else:
                    has_draw = False
            else:
                has_draw = False
            pt = rel_target(tpl_rels, 'printerSettings') or '../printerSettings/printerSettings10.bin'
            items['xl/worksheets/_rels/sheet%d.xml.rels' % tgt_sheet_no] = (
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/printerSettings" Target="%s"/>' % pt
                + ('<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing%d.xml"/>' % tgt_draw_no if has_draw else '')
                + '</Relationships>').encode('utf-8')
            wb = wb.replace('</sheets>', '<sheet name="%s" sheetId="%d" r:id="%s"/></sheets>' % (name, next_sid, rid))
            wbrels = wbrels.replace('</Relationships>',
                                    '<Relationship Id="%s" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet%d.xml"/></Relationships>' % (rid, tgt_sheet_no))
            ct = items['[Content_Types].xml'].decode('utf-8')
            ct = ct.replace('</Types>',
                            '<Override PartName="/xl/worksheets/sheet%d.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' % tgt_sheet_no
                            + ('<Override PartName="/xl/drawings/drawing%d.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' % tgt_draw_no if has_draw else '')
                            + '</Types>')
            items['[Content_Types].xml'] = ct.encode('utf-8')
            sheets.append((name, str(next_sid), rid))
            names.append(name)
            rel_map[rid] = 'worksheets/sheet%d.xml' % tgt_sheet_no
            tgt_sheet_no += 1
            tgt_draw_no += 1
            next_rid += 1
            next_sid += 1
            print('   已新增 sheet%d.xml' % (tgt_sheet_no - 1))

        if miss:
            print('   ⚠ 第 4 行有 %d 格未替换成功，请检查' % miss)
        if not has_cfg:
            print('   ⚠ 节假日配置里没有 %s，已按常规周末生成；若有法定假日请编辑 HOLIDAY_CFG 后加 --force 重跑，或直接在 Excel 改第 4 行字母' % name)
        if prev_name:
            print('   年度累计引用已写入 %d 处' % nref)
        changed = True
        report_sheet(items, sf if not exist else tgt, y, m)

    if not changed:
        print('\n没有需要创建的月份，未改动文件。')
        return 0

    items['xl/workbook.xml'] = wb.encode('utf-8')
    items['xl/_rels/workbook.xml.rels'] = wbrels.encode('utf-8')
    if 'xl/calcChain.xml' in items:                 # 公式链缓存只覆盖旧表，留着会不一致
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

    print('\n===== 校验 =====')
    ok, rep = verify(items)
    for r in rep:
        print(r)

    write_zip(XLSX, items)
    print('\n已写回 → %s' % XLSX)
    print('结论：%s' % ('全部通过' if ok else '存在问题，请用备份恢复'))
    return 0 if ok else 2


if __name__ == '__main__':
    sys.exit(main(sys.argv))
