/**
 * WebView APK 邮件构建机器人
 * 轮询 @webview 邮件 → 下载 JSON 配置 → 本地构建 APK → 发送回执邮件
 * 用法: node webview-bot.js
 * 由 Windows 任务计划定时触发
 */
const _origLog = console.log;
const _origError = console.error;
console.log = (...args) => {
    const msg = args.join(' ');
    if (msg.match(/\[(recv|build|skip|error|email|done|暂无|发现|扫描|审核)\]/)) _origLog(...args);
};
console.error = (...args) => {
    const msg = args.join(' ');
    if (msg.match(/\[(recv|build|skip|error|email|done|暂无|发现|扫描|审核)\]/)) _origError(...args);
};

const ImapFlow = require('imapflow').ImapFlow;
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const { execSync } = require('child_process');

// ─── 配置 ──────────────────────────────────────────────────
const BUILDER_DIR = 'D:/webview/builder';
const PENDING_DIR = path.join(BUILDER_DIR, 'pending');
const APPROVED_DIR = path.join(BUILDER_DIR, 'approved');
const OUTPUT_DIR = path.join(BUILDER_DIR, 'output');
const LOCK_DIR = path.join(__dirname, 'lock');

// 可信发件人：自动构建，无需审核
const TRUSTED_SENDERS = ['9187541@qq.com'];

// 确保目录存在
[PENDING_DIR, APPROVED_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ─── 去重 ──────────────────────────────────────────────────
function isUIDProcessed(uid) {
    return fs.existsSync(path.join(LOCK_DIR, `${uid}.lock`));
}
function markUIDProcessed(uid) {
    fs.writeFileSync(path.join(LOCK_DIR, `${uid}.lock`), '', 'utf8');
}

// ─── 发送邮件 ──────────────────────────────────────────────
async function sendMail(to, subject, text, attachments) {
    const transporter = nodemailer.createTransport({
        host: 'smtp.qq.com', port: 587, secure: false,
        auth: { user: '9187541@qq.com', pass: 'kyurfxweeogocaci' },
    });
    try {
        await transporter.sendMail({
            from: '"APK 构建机器人" <9187541@qq.com>',
            to, subject, text,
            ...(attachments ? { attachments } : {}),
        });
        console.log(`[email] 回执已发送至 ${to}`);
    } catch (err) {
        console.error(`[email] 回执发送失败: ${err.message}`);
    } finally {
        transporter.close();
    }
}

// ─── 构建 APK ──────────────────────────────────────────────
async function buildApk(configPath, keystorePass) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const buildId = Date.now().toString(36);
    const isLocal = config.sourceMode === 'local';
    const isRelease = config.signMode === 'release';

    // Build command - using the local builder project directly
    const gradleBin = 'C:\\Users\\Administrator\\.gradle\\wrapper\\dists\\gradle-7.6-bin\\6sdr7bbr5xerbhqpbpn9wc2ku9\\gradle-7.6\\bin\\gradle.bat';
    const buildTask = isRelease ? 'assembleRelease' : 'assembleDebug';

    // Find the latest net.snowhoo.app build or use it as template
    const projectDir = 'D:/webview/project';

    // We need to modify the project in-place before build
    // Copy template, modify, build
    const buildDir = path.join(OUTPUT_DIR, buildId);
    const templateDir = path.join(BUILDER_DIR, 'template');

    // Copy template
    copyDirSync(templateDir, buildDir);

    // Modify files
    const javaBase = path.join(buildDir, 'app', 'src', 'main', 'java');
    const oldPkgDir = path.join(javaBase, 'com', 'example', 'app');
    const safePackage = config.packageName.replace(/[^a-z0-9.]/g, '');
    const newPkgDir = path.join(javaBase, ...safePackage.split('.'));

    fs.mkdirSync(newPkgDir, { recursive: true });

    for (const file of fs.readdirSync(oldPkgDir).filter(f => f.endsWith('.java'))) {
        let content = fs.readFileSync(path.join(oldPkgDir, file), 'utf8');
        content = content.replace(/com\.example\.app/g, safePackage);

        if (isLocal) {
            content = content.replace(
                /\/\/ REMOTE RESOURCE[\s\S]*?\/\/ LOCAL RESOURCE[\s\S]*?mWebView\.loadUrl\([^)]*\);/,
                `// LOCAL RESOURCE (offline mode)
        mWebView.loadUrl("file:///android_asset/index.html");`
            );
        } else {
            content = content.replace(
                /\/\/ REMOTE RESOURCE[\s\S]*?mWebView\.loadUrl\([^)]*\);/,
                `// Remote - ${config.url}
        mWebView.loadUrl("${config.url}");`
            );
        }
        content = content.replace('example.com', isLocal ? '' : new URL(config.url).hostname);
        fs.writeFileSync(path.join(newPkgDir, file), content);
    }

    // Delete old package - handle same-root case
    const oldRoot = path.join(javaBase, 'com');
    const newRoot = path.join(javaBase, safePackage.split('.')[0]);
    if (oldRoot !== newRoot) {
        try { fs.rmSync(oldRoot, { recursive: true, force: true }); } catch {}
    } else {
        try { fs.rmSync(oldPkgDir, { recursive: true, force: true }); } catch {}
    }

    // Modify manifest
    let manifest = fs.readFileSync(path.join(buildDir, 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    manifest = manifest.replaceAll('com.example.app', safePackage);
    fs.writeFileSync(path.join(buildDir, 'app', 'src', 'main', 'AndroidManifest.xml'), manifest);

    // Strings
    let strings = fs.readFileSync(path.join(buildDir, 'app', 'src', 'main', 'res', 'values', 'strings.xml'), 'utf8');
    strings = strings.replace(/<string name="app_name">.*<\/string>/, `<string name="app_name">${config.appName}</string>`);
    fs.writeFileSync(path.join(buildDir, 'app', 'src', 'main', 'res', 'values', 'strings.xml'), strings);

    // Handle icon (base64 or URL)
    let iconBuf = null;
    if (config.iconBase64) {
        try {
            const b64 = config.iconBase64.replace(/^data:image\/\w+;base64,/, '');
            iconBuf = Buffer.from(b64, 'base64');
        } catch {}
    } else if (config.iconUrl) {
        try {
            const mod = config.iconUrl.startsWith('https') ? require('https') : require('http');
            iconBuf = await new Promise((resolve, reject) => {
                mod.get(config.iconUrl, (resp) => {
                    const chunks = [];
                    resp.on('data', c => chunks.push(c));
                    resp.on('end', () => resolve(Buffer.concat(chunks)));
                }).on('error', reject);
            });
        } catch {}
    }
    if (iconBuf) {
        try {
            const sharp = require('sharp');
            const sizes = { 'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96, 'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192 };
            const resBase = path.join(buildDir, 'app', 'src', 'main', 'res');
            for (const [folder, size] of Object.entries(sizes)) {
                await sharp(iconBuf).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .png({ compressionLevel: 6, force: true }).toFile(path.join(resBase, folder, 'ic_launcher.png'));
            }
        } catch {}
    }

    // Save description if provided
    if (config.shortDesc || config.fullDesc) {
        const descPath = path.join(APPROVED_DIR, 'desc_' + Date.now().toString(36) + '.txt');
        const desc = [
            config.shortDesc ? `【一句话简介】\n${config.shortDesc}` : '',
            config.fullDesc ? `\n【完整介绍】\n${config.fullDesc}` : ''
        ].filter(Boolean).join('\n');
        fs.writeFileSync(descPath, desc, 'utf8');
    }

    // build.gradle
    let bg = fs.readFileSync(path.join(buildDir, 'app', 'build.gradle'), 'utf8');
    bg = bg.replaceAll('com.example.app', safePackage);
    bg = bg.replace(/compileSdkVersion\s+\d+/, 'compileSdkVersion 34');
    bg = bg.replace(/targetSdkVersion\s+\d+/, 'targetSdkVersion 34');
    bg = bg.replace(/versionCode\s+\d+/, `versionCode ${config.versionCode || 1}`);
    bg = bg.replace(/versionName\s+"[^"]*"/, `versionName "${config.versionName || '1.0.0'}"`);

    if (isRelease && config.keystoreAlias) {
        const ksPath = path.join(BUILDER_DIR, 'keystores', `${config.keystoreAlias}.keystore`).replace(/\\/g, '/');
        bg = `apply plugin: 'com.android.application'

android {
    compileSdkVersion 34
    defaultConfig {
        applicationId "${safePackage}"
        minSdkVersion 21
        targetSdkVersion 34
        versionCode ${config.versionCode || 1}
        versionName "${config.versionName || '1.0.0'}"
    }
    signingConfigs {
        release {
            storeFile file('${ksPath}')
            storePassword '${keystorePass || 'abc123456'}'
            keyAlias '${config.keystoreAlias}'
            keyPassword '${keystorePass || 'abc123456'}'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}

dependencies {
    implementation fileTree(dir: 'libs', include: ['*.jar'])
}
`;
    }

    fs.writeFileSync(path.join(buildDir, 'app', 'build.gradle'), bg);
    fs.writeFileSync(path.join(buildDir, 'local.properties'), 'sdk.dir=D:\\\\webview\\\\android-sdk');
    
    // Clean up stale .gradle from buildDir to avoid issues
    try { fs.rmSync(path.join(buildDir, '.gradle'), { recursive: true, force: true }); } catch {}

    // Run build
    try {
        const env = Object.assign({}, process.env, {
            ANDROID_SDK_ROOT: 'D:\\webview\\android-sdk',
            ANDROID_HOME: 'D:\\webview\\android-sdk',
            JAVA_HOME: 'D:\\webview\\jdk\\jdk-17.0.19+10',
        });
        const result = execSync(`"${gradleBin}" ${buildTask} --no-daemon`, {
            cwd: buildDir, env, maxBuffer: 10 * 1024 * 1024, timeout: 300000, encoding: 'utf8'
        });

        if (!result.includes('BUILD SUCCESSFUL')) {
            throw new Error('Build failed');
        }

        const apkSubDir = isRelease ? 'release' : 'debug';
        const apkSrc = path.join(buildDir, 'app', 'build', 'outputs', 'apk', apkSubDir, isRelease ? 'app-release.apk' : 'app-debug.apk');
        const apkDest = path.join(OUTPUT_DIR, `${safePackage.replace(/\./g, '_')}_${buildId}.apk`);

        if (fs.existsSync(apkSrc)) {
            fs.copyFileSync(apkSrc, apkDest);
            return { success: true, apkPath: apkDest, buildId };
        }

        // Try unsigned release
        const unsignedPath = path.join(buildDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk');
        if (fs.existsSync(unsignedPath)) {
            // Sign it
            const JAVA_HOME = 'D:\\webview\\jdk\\jdk-17.0.19+10';
            const ksPath = path.join(BUILDER_DIR, 'keystores', `${config.keystoreAlias}.keystore`);
            const signedTmp = path.join(OUTPUT_DIR, `${buildId}_signed.apk`);
            execSync(`"${JAVA_HOME}\\bin\\jarsigner" -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore "${ksPath}" -storepass "${keystorePass}" -keypass "${keystorePass}" -signedjar "${signedTmp}" "${unsignedPath}" "${config.keystoreAlias}"`);
            // Zipalign
            const aligned = path.join(OUTPUT_DIR, `${safePackage.replace(/\./g, '_')}_${buildId}.apk`);
            execSync(`"D:\\webview\\android-sdk\\build-tools\\34.0.0\\zipalign" -v 4 "${signedTmp}" "${aligned}"`);
            try { fs.unlinkSync(signedTmp); } catch {}
            return { success: true, apkPath: aligned, buildId };
        }

        throw new Error('APK file not found after build');
    } finally {
        // Clean build dir after a delay
        setTimeout(() => {
            try { fs.rmSync(buildDir, { recursive: true, force: true }); } catch {}
        }, 120000);
    }
}

function copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        const s = path.join(src, entry.name), d = path.join(dest, entry.name);
        entry.isDirectory() ? copyDirSync(s, d) : fs.copyFileSync(s, d);
    }
}

// ─── 处理 @webview 邮件 ──────────────────────────────────
async function handleWebviewEmail(client, uid, from, subject, em) {
    if (isUIDProcessed(uid)) {
        console.log(`[skip] UID=${uid} 已处理`);
        return;
    }

    // 检查是否是可信发件人
    const isTrusted = TRUSTED_SENDERS.includes(from);
    const title = subject.replace(/^@webview\s*/i, '').replace(/^(RE|Re|Fwd|转发)\s*:\s*/i, '').trim();

    console.log(`[recv] @webview 来自: ${from} | ${title}`);

    // 尝试从正文找 JSON
    let config = null;
    const body = em.text || '';
    const html = em.html || '';

    // 1. 先尝试解析正文 JSON
    for (const text of [body, html]) {
        if (!text) continue;
        const cleanText = text.replace(/<[^>]+>/g, ''); // strip HTML tags
        const jsonMatch = cleanText.match(/\{[\s\S]*"appName"[\s\S]*\}/);
        if (jsonMatch) {
            try {
                config = JSON.parse(jsonMatch[0]);
                break;
            } catch {}
        }
    }

    // 2. 尝试附件 JSON
    if (!config && em.attachments) {
        for (const att of em.attachments) {
            if (att.filename && att.filename.endsWith('.json')) {
                try {
                    config = JSON.parse(att.content.toString('utf8'));
                    break;
                } catch {}
            }
        }
    }

    if (!config || !config.appName || !config.packageName) {
        await sendMail(from, `❌ 构建失败: ${title}`,
            '未找到有效的 JSON 配置。\n\n请在邮件正文中包含完整 JSON，或添加 .json 附件。\n\n格式参考:\n{"appName":"示例","packageName":"com.example.app","sourceMode":"url","url":"https://..."}');
        markUIDProcessed(uid);
        return;
    }

    // 保存 JSON 到 pending 目录
    const jsonFileName = `${uid}_${config.packageName.replace(/\./g, '_')}_${Date.now().toString(36)}.json`;
    const jsonPath = path.join(PENDING_DIR, jsonFileName);
    config._emailFrom = from;
    config._emailSubject = subject;
    config._emailUid = uid;
    config._receivedAt = new Date().toISOString();
    config._isTrusted = isTrusted;
    fs.writeFileSync(jsonPath, JSON.stringify(config, null, 2));

    if (isTrusted) {
        // 自动构建
        console.log(`[审核] 可信发件人 ${from}，自动构建`);
        try {
            const result = await buildApk(jsonPath, 'abc123456');
            if (result.success) {
                const apkSize = (fs.statSync(result.apkPath).size / 1024).toFixed(1);
                await sendMail(from, `✅ 构建成功: ${config.appName}`,
                    `应用 "${config.appName}" 已自动构建完成！\n\n包名: ${config.packageName}\n版本: ${config.versionName || '1.0.0'}\n大小: ${apkSize} KB\n模式: ${config.sourceMode}\n${config.shortDesc ? '\n简介: ' + config.shortDesc : ''}\n\nAPK 见附件。`,
                    [{ filename: `${config.packageName.replace(/\./g, '_')}.apk`, path: result.apkPath }]
                );
                console.log(`[build] ✅ 自动构建成功，APK 已发送至 ${from}`);
                // Move to approved
                fs.renameSync(jsonPath, path.join(APPROVED_DIR, jsonFileName));
            }
        } catch (err) {
            console.error(`[error] 自动构建失败: ${err.message}`);
            await sendMail(from, `❌ 构建失败: ${config.appName}`,
                `自动构建 "${config.appName}" 失败。\n\n错误: ${err.message.slice(0, 500)}\n\n请检查配置后重试。`);
            // Mark as error, keep in pending for manual review
            config._error = err.message.slice(0, 500);
            fs.writeFileSync(jsonPath, JSON.stringify(config, null, 2));
        }
    } else {
        // 需要审核
        console.log(`[审核] 非可信发件人 ${from}，加入待审核队列`);
        await sendMail(from, `⏳ 等待审核: ${config.appName}`,
            `应用 "${config.appName}" 的构建请求已收到，等待管理员审核。\n\n审核通过后将自动构建并发送 APK。\n\n包名: ${config.packageName}\n版本: ${config.versionName || '1.0.0'}\n`);
    }

    markUIDProcessed(uid);
    await client.messageFlagsAdd(uid, ['\\Seen']).catch(() => {});
}

// ─── 主逻辑 ──────────────────────────────────────────────
async function run() {
    const client = new ImapFlow({
        host: 'imap.qq.com', port: 993, secure: true,
        auth: { user: '9187541@qq.com', pass: 'kyurfxweeogocaci' },
        logger: { fatal() {}, error() {}, warn() {}, info() {}, debug() {}, trace() {}, child: () => ({}) },
    });

    try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        try {
            const since = new Date(Date.now() - 10 * 60 * 60 * 1000);
            const uids = await client.search({ since });

            if (!uids.length) {
                console.log('[暂无] 10小时内无新邮件');
                return;
            }

            console.log(`[扫描] 发现 ${uids.length} 封邮件（10小时内）`);

            let webviewCount = 0;
            for (const uid of uids) {
                // Skip already processed
                if (isUIDProcessed(uid)) continue;

                try {
                    const raw = await client.fetchOne(uid, { source: true });
                    const em = await simpleParser(raw.source);
                    const from = em.from?.value?.[0]?.address || 'unknown';
                    let subject = em.subject || '';

                    // Clean subject
                    subject = subject.replace(/^(转发|RE|Re|FW|Fwd|Re:)\s*:\s*/i, '').trim();

                    if (/^@webview\b/i.test(subject)) {
                        await handleWebviewEmail(client, uid, from, subject, em);
                        webviewCount++;
                    }
                } catch (err) {
                    console.error(`[error] UID=${uid} 处理失败: ${err.message}`);
                }
            }

            console.log(`[done] 扫描完成，处理 ${webviewCount} 封 @webview 邮件`);

        } finally {
            lock.release();
        }
    } catch (err) {
        console.error(`[error] 运行失败: ${err.message}`);
    } finally {
        try { await client.logout(); } catch {}
    }
}

console.log(`[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] WebView 邮件构建机器人启动`);
run().then(() => {
    console.log(`[${dayjs().format('HH:mm:ss')}] 本轮结束`);
    process.exit(0);
}).catch(err => {
    console.error(`[error] ${err.message}`);
    process.exit(1);
});
