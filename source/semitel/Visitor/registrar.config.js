/* 访客系统本地配置（main / in / out / oin / oout 共用；云端部署时本文件随目录发布）
   REGISTRAR_DEFAULT：main 载入数据时，登记人为空的记录自动补此值
   COMPANY_NAME：公司名称，显示在页头品牌行与访客单标题栏（留空显示默认文案）
   COMPANY_LOGO：logo 图片文件名（如 'logo.png'，放页面同目录），页头品牌行用；留空不显示，加载失败自动隐藏
   LOGO_PASS：访客单（pass）顶部专用 logo，独立于页头 logo；留空时回退用 COMPANY_LOGO */
window.REGISTRAR_DEFAULT = '蒋雯';
window.COMPANY_NAME = '苏州晶讯科技股份有限公司';
window.COMPANY_LOGO = 'logo.png';
window.LOGO_PASS = 'logo_pass.png'
