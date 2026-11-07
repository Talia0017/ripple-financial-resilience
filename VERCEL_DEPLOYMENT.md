# Ripple：Vercel 静态网站部署

## 现在使用的架构

Python 读取两份官方 CSV，使用原有 `engine.py` 预先计算全部 4,500 个账户。
计算结果保存在已提交到 Git 的 `public/data/profiles.json`，约 414 KiB。
网页用 HTML、CSS 和 JavaScript 加载这些摘要，直接在浏览器内模拟冲击。

**不需要 Docker、Streamlit 云服务、数据库、后端 API 或服务器环境变量。**
原有 Streamlit 本地版和所有财务公式都保留。本次静态方案取代之前的 Container 部署设置；
根目录 Dockerfile 仅保留为旧的本地运行参考，不再用于 Vercel。

主办方已允许官方挑战数据公开使用，项目负责人于 2026-11-07 转达确认；数据不包含真实客户记录。
网页使用的是全部官方账户摘要，不是几个演示账户。

## 你在 Vercel 里怎么填

1. 登录 Vercel，选择 **Add New → Project**。
2. 导入 `Talia0017/ripple-financial-resilience`。
3. 检查下面的设置，再点击 **Deploy**。

| 设置项 | 填写内容 |
|---|---|
| Production Branch | `main` |
| Framework Preset | **Other** |
| Root Directory | 仓库根目录 `./`，不要选 `financial_resilience` 或 `public` |
| Install Command | `npm ci --ignore-scripts` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js Version | 22 或更新的受支持版本 |
| Environment Variables | 不需要；删除之前专门为容器设置的 `PORT` 和本机 CSV 路径 |
| Start Command / Python / Docker | 不需要 |

这些构建设置也已写进 `vercel.json`。
如果以前已经创建了 Container 项目，在项目 Settings → Build and Deployment 中改为上述设置，
再选择 **Redeploy**。不要继续使用 Container、Next.js、Streamlit 启动命令或旧 Output Directory。

Vercel 构建时只用仓库内的 Node 构建脚本与 `public/` 文件，不需要访问你的 Mac，也不用重新运行 Python。
构建脚本验证资料包含全部 4,500 个账户，随后只复制网站需要的五个文件到 `dist/`。

## 怎么确认真的上线

不能只看到 GitHub 推送成功就认为网站上线了。请确认：

1. Vercel 部署状态显示 **Ready**，点击它提供的网站 URL。
2. 页面顶部显示 **“4,500 个官方账户 · 已就绪”**。
3. 访问 `https://你的域名/data/profiles.json`，应能读取公开账户摘要，不能返回 404 或 HTML 错误页。
4. 随机选几个账户，检查六项指标、基准续航和前后对比。
5. 同时开启三个冲击，调整参数，然后点击重置；切换账户时，情景应恢复默认值。
6. 输入不存在的 ID 应显示清楚的提示；维修费用大于缓冲金时续航应为 0。

如果账户资料加载失败，页面会提示重试并停用查找，不会假装已有数据。
没有外部字体、CDN 脚本、API 密钥或本机路径依赖。

## 本地预览

```sh
npm ci --ignore-scripts
npm test
npm run build
python3 -m http.server 8502 --bind 127.0.0.1 --directory dist
```

打开 http://localhost:8502。不要直接双击 HTML 文件。
本地静态服务器只从 `dist/` 提供文件；该目录没有原始 CSV、Python 环境、Git 凭据或服务器代码。

## 数据更新与核对

日常 Vercel 部署不需要原始 CSV。只有更新数据或独立核对时才需要：

```sh
financial_resilience/.venv/bin/python financial_resilience/export_profiles.py
financial_resilience/.venv/bin/python financial_resilience/verify_real_data.py
financial_resilience/.venv/bin/python financial_resilience/verify_web_profiles.py
npm test
npm run build
```

所有金额保留完整计算精度，显示时才格式化。资料含来源文件的 SHA-256，方便确认是哪一份数据生成。
主办方与 Tangerine Track 的数据署名已写入 README、JSON 元数据和网页说明。

## 部署状态说明

本地测试、构建以及从静态 HTTP 服务加载数据，可以证明部署产物不依赖本机 CSV；
但仍需检查实际 Vercel URL 才能确认线上发布。最终交付回复会明确说明是否完成了这一步。

官方设置参考：[Vercel 构建配置](https://vercel.com/docs/builds/configure-a-build)、
[vercel.json 配置](https://vercel.com/docs/project-configuration/vercel-json)。
