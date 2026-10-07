/* 访客系统本地配置（main / in / out / oin / oout 共用；云端部署时本文件随目录发布）
   REGISTRAR_DEFAULT：main 载入数据时，登记人为空的记录自动补此值
   COMPANY_NAME：公司名称，显示在页头品牌行与访客单标题栏（留空显示默认文案）
   COMPANY_LOGO：logo 图片文件名（如 'logo.png'，放页面同目录），页头品牌行用；留空不显示，加载失败自动隐藏
   LOGO_PASS：访客单（pass）顶部专用 logo，独立于页头 logo；留空时回退用 COMPANY_LOGO */
window.REGISTRAR_DEFAULT = '蒋雯';
window.COMPANY_NAME = '苏州晶讯科技股份有限公司';
window.COMPANY_NAME_EN = 'Suzhou Semitel Technology Co., Ltd.';
window.COMPANY_LOGO = 'logo.png';
window.LOGO_PASS = 'logo_pass.png'

/* 管理员密码（明文）：防止误操作的二次确认，用于清空回收站 / 彻底删除 / 清理云端。留空则不拦截 */
window.ADMIN_PWD = '123'

/* ====== 地址配置（迁移时改这里即可） ======
   LOCAL_WALINE：本地 waline-mini 地址（如 'http://192.168.1.10:8360'）；留空 = 自动跟随访问地址(:8360)
   LOCAL_H5：本地 H5 页面地址（预留，当前本地页面均同源访问）
   CLOUD_WALINE：云端 Waline 地址（oin/oout/otol/cdata 使用）
   CLOUD_H5：云端 H5 页面目录（main 引用 otol/cdata 的来源） */
window.LOCAL_WALINE = '';
window.LOCAL_H5 = '';
window.CLOUD_WALINE = 'https://waline.snowhoo.net';
window.CLOUD_H5 = 'https://snowhoo.net/semitel/Visitor';
