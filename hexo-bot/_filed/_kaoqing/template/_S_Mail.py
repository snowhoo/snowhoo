# -*- coding: utf-8 -*-
"""
_S_Mail.py —— 把生成好的「出勤状况汇总表」作为邮件附件发出去

参考 D:/hexo/hexo-bot/email-bot/email-to-hexo.js 的发送部分
（nodemailer + smtp.qq.com，STARTTLS），用 Python 标准库 smtplib 改写，无第三方依赖。

配置：脚本顶部 CONFIG 区块。改收件人直接改 MAIL_TO，改附件改 ATTACHMENTS / XLSX。

用法：
    py _S_Mail.py              发送（联网，用 QQ 邮箱授权码登录 SMTP）
    py _S_Mail.py --dry-run    只构造邮件并打印，不连接、不发送
    py _S_Mail.py --test       连接 SMTP 做一次登录校验（不发信），确认授权码有效
"""

import os
import smtplib
import sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email.header import Header
from email import encoders
from email.utils import formataddr

# ============================== 配置（可随时改）==============================
SMTP_HOST = 'smtp.qq.com'
SMTP_PORT = 587                      # 587 = STARTTLS；QQ 邮箱必须用授权码而非登录密码
SMTP_USER = '9187541@qq.com'
SMTP_PASS = 'kyurfxweeogocaci'      # QQ 邮箱「授权码」，不是邮箱登录密码
MAIL_FROM_NAME = '考勤汇总机器人'
MAIL_FROM_ADDR = SMTP_USER

# 收件人：多个用逗号分隔，例如 'a@x.com,b@y.com'
MAIL_TO = 'george.gu@semiteltech.com'

# 主题 / 正文
MAIL_SUBJECT = '出勤状况汇总表'
MAIL_BODY = (
    '您好：\n\n'
    '附件为最新生成的《出勤状况汇总表》。\n'
    '本表由考勤系统自动归档、汇总生成。\n\n'
    '（本邮件由脚本自动发送，请勿直接回复）'
)

# 附件：默认就是汇总表；多个文件用列表
XLSX = r'D:\hexo\source\kaoqing\template\_出勤状况汇总表.xlsx'
ATTACHMENTS = [XLSX]
# ============================== 配置结束 ==============================


def build_message():
    """构造 MIME 邮件（含附件）。返回 (msg, recipients列表)。"""
    recipients = [a.strip() for a in MAIL_TO.split(',') if a.strip()]
    if not recipients:
        raise SystemExit('[FAIL] MAIL_TO 为空，请在脚本顶部配置收件人')

    msg = MIMEMultipart()
    msg['From'] = formataddr((MAIL_FROM_NAME, MAIL_FROM_ADDR))
    msg['To'] = ', '.join(recipients)
    msg['Subject'] = Header(MAIL_SUBJECT, 'utf-8')
    msg.attach(MIMEText(MAIL_BODY, 'plain', 'utf-8'))

    attached = 0
    for att in ATTACHMENTS:
        if not os.path.exists(att):
            print('[WARN] 附件不存在，跳过: %s' % att)
            continue
        with open(att, 'rb') as f:
            part = MIMEBase('application', 'octet-stream')
            part.set_payload(f.read())
        encoders.encode_base64(part)
        fn = os.path.basename(att)
        # RFC2231 编码，保证中文文件名在邮件客户端正确显示
        part.add_header('Content-Disposition', 'attachment', filename=('utf-8', '', fn))
        msg.attach(part)
        attached += 1
        print('[INFO] 已挂附件: %s (%d bytes)' % (fn, os.path.getsize(att)))

    if attached == 0:
        raise SystemExit('[FAIL] 没有任何可用附件，取消发送')
    return msg, recipients


def send_mail(msg, recipients):
    """连接 SMTP、STARTTLS、登录并发送。"""
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as s:
        s.ehlo()
        s.starttls()
        s.ehlo()
        s.login(SMTP_USER, SMTP_PASS)
        s.send_message(msg)
    print('[OK] 邮件已发送至: %s' % ', '.join(recipients))


def test_login():
    """只做登录校验，不发信，用于确认授权码仍有效。"""
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as s:
        s.ehlo()
        s.starttls()
        s.ehlo()
        s.login(SMTP_USER, SMTP_PASS)
    print('[OK] SMTP 登录成功，授权码有效（未发信）')


def main(argv):
    if '--dry-run' in argv:
        msg, recipients = build_message()
        print('[DRY-RUN] 不连接、不发送，邮件内容如下：')
        print('  From : %s' % msg['From'])
        print('  To   : %s' % msg['To'])
        print('  Subj : %s' % MAIL_SUBJECT)
        for att in ATTACHMENTS:
            if os.path.exists(att):
                print('  附件 : %s (%d bytes)' % (att, os.path.getsize(att)))
            else:
                print('  附件 : %s (缺失!)' % att)
        return 0

    if '--test' in argv:
        test_login()
        return 0

    msg, recipients = build_message()
    send_mail(msg, recipients)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
