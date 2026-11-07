# Ripple 的 Vercel 部署说明

## 当前结论

Ripple 是 **Python + Pandas + Streamlit** 应用，不是 React 或 Next.js。
网页界面由 `financial_resilience/app.py` 创建，计算在 `engine.py`，数据读取在 `data_access.py`。
本仓库没有前端 npm 构建流程；不能把 Streamlit 启动命令填进 Vercel 的 Build Command 后就当作静态网页部署。

2026-11-07 核对的 Vercel 官方文档提供 **Container Runtime（Beta）**：Vercel 构建根目录 Dockerfile，运行其中的 HTTP 服务。
因此本次采用容器适配，保留现有 Streamlit 界面与全部计算代码，不改写成 React/Next.js。
当前官方文档也支持 WebSocket，但需要启用 Fluid compute。

**状态：部署配置已准备；尚未完成容器构建和 Vercel 线上验证。真实账户数据版尚未就绪。**
配置兼容性的依据是官方文档和配置 schema，并不是已经成功上线的证明。

## 本次增加了什么

- `Dockerfile`：使用 Python 3.12，安装现有两个依赖，启动原来的 Streamlit 服务。
- `vercel.json`：选择 `container` 框架。
- `.dockerignore`：只允许部署所需的源码、依赖声明和 Docker 配置进入构建上下文。
- `.vercelignore`：限制从本机使用 Vercel CLI 时允许上传的文件。
- 本说明和 README 链接。

Dockerfile 只复制三个应用 `.py` 文件和 `requirements.txt`，不执行 `COPY . .`。
原始 CSV、`.env`、Git 登录资料、虚拟环境、报告、测试和本机临时文件都不会进入这个部署包。
GitHub 中仍仅保留代码与文档。本地原有数据和运行方式继续保留。

## Vercel 页面里具体怎么填

在 Vercel 选择 **Add New → Project**，导入 `Talia0017/ripple-financial-resilience`。
如果已有同仓库项目，请在该项目设置中调整，不要新建重复项目。

| 设置项 | 填写内容 |
|---|---|
| Git Repository | `Talia0017/ripple-financial-resilience` |
| Production Branch | `main` |
| Framework Preset | **Container** |
| Root Directory | 仓库根目录，通常显示 `./`；不要选 `financial_resilience` |
| Build Command | 保持默认，不开启自定义覆盖；由 Dockerfile 构建 |
| Install Command | 保持默认，不开启自定义覆盖；Dockerfile 内安装依赖 |
| Output Directory | 保持默认，不填写 `.next`、`dist` 或其他静态目录 |
| Start Command（若页面出现） | 保持 Dockerfile 的 CMD，不另填 Next.js/npm 命令 |
| Environment Variables | 新增 `PORT`，值为 `8501`，应用于 Production 和 Preview |
| Fluid compute | **Enabled**，用于 Streamlit 的 WebSocket 连接 |
| Python Version | 由 Dockerfile 的 `python:3.12-slim` 决定；不依赖 Vercel Python Functions 的版本设置 |

若导入页面没有 **Container** 选项，先确认账号是否可以使用 Container Runtime Beta，或联系 Vercel 支持。
不要改选 Next.js/Other 后反复填启动命令；这不能代替容器运行环境。
目前尚未登录你的 Vercel 账号，不能确认你的项目页面实际是否已开放该功能。

这些设置可以启动**不含数据的应用页面**。本次没有连接你的 Vercel 账号、创建部署或取得线上 URL。

## 真实 Tangerine 账户在线上能用吗？

**目前不能。项目负责人已确认：数据只允许受限访问，不能公开展示。**

当前部署包没有 `monthly_summary.csv` 和 `loans.csv`，也没有实现获授权的私有数据连接。
网站即使成功启动，也会显示“找不到必要文件”的提示，不能查真实账户、计算真实客户续航，
也不会偷偷换成虚构客户。你在本机使用官方文件的功能仍然可用。

Vercel 是另一台电脑，不能读取你的 Mac 文件夹。把本机路径放进 `RESILIENCE_DATA_DIR`
不会上传或同步数据；该变量只指向服务器上已存在的目录。

要提供真正可用的受限在线版本，还需要完成并验证：

1. 明确书面许可中的访问人员、第三方托管范围和可展示的字段。
2. 先配置并验证网站访问限制，例如满足许可范围的 Vercel Deployment Protection。
   仅使用难猜的网址不构成访问控制。
3. 选择许可允许的私有数据来源，设计服务器端授权读取；不能把 CSV 放进公开仓库或公开下载链接。
4. 对未授权用户的拒绝访问，以及授权用户的真实账户查询和模拟，进行线上测试。

当前没有配置上述私有数据存储、下载、登录或访问控制。不要为了让页面出现真实账户而把数据提交到 Git，
也不要取消忽略规则。这些部署配置并不授予数据使用权限。

## 怎么验证部署

### 本机已经可以执行的检查

在仓库根目录运行：

```sh
financial_resilience/.venv/bin/python -m unittest discover -s financial_resilience/tests -v
```

合成测试不需要官方 CSV。Docker 部署文件没有修改财务计算或 Streamlit 交互逻辑。

本次已完成：45 项现有测试通过；Vercel 官方 schema 确认 `container` 是有效框架；
忽略规则白名单审查、启动命令语法检查、不含数据的打包源码页面测试均通过。
忽略规则检查使用兼容的 Git 规则解析器，不等同于实际执行 Docker 构建或 Vercel 上传。

### 有 Docker 的电脑可以验证容器

本次开发环境没有可用的 Docker CLI，所以**尚未执行**以下镜像构建步骤。

```sh
docker build -t ripple-vercel .
docker run --rm -p 8501:8501 -e PORT=8501 ripple-vercel
```

然后打开 `http://localhost:8501`。预期能看到 Ripple 页面及缺少数据的提示；这不等于真实数据功能已经可用。
另开终端，检查服务健康状态：

```sh
curl --fail http://localhost:8501/_stcore/health
```

预期返回 `ok`。还应在浏览器开发者工具的 Network → WS 中检查 `/_stcore/stream` 连接，
并确认镜像内没有 CSV、环境密钥和本机虚拟环境。

### Vercel 上需要继续验证

1. 部署日志显示容器成功构建、启动并监听 `8501`。
2. 部署状态为 Ready，实际 URL 能打开。
3. `https://你的域名/_stcore/health` 返回 `ok`，浏览器没有持续断开/重连提示。
4. 没有数据时出现明确提示，线上不存在真实账户或 CSV 下载地址。
5. 未来接入受限数据后，再验证访问限制、账户查询、组合冲击和重置。

容器可能缩容，WebSocket 连接也受函数运行时长限制。重连可能到达另一实例，因此不要把会话状态当作永久存储；
需要在真实部署中验证重连与重新选择情景的体验。当前的独立本地应用不受这些云端限制。

## 官方依据

- [Vercel Container Runtime](https://vercel.com/docs/functions/runtimes/container)：容器部署、框架选择、PORT。
- [Vercel WebSockets](https://vercel.com/docs/functions/websockets)：Fluid compute、连接时长和重连。
- [Vercel .vercelignore](https://vercel.com/docs/deployments/vercel-ignore)：CLI 上传文件排除规则。
- [Vercel 配置 schema](https://openapi.vercel.sh/vercel.json)：`framework: container` 的有效性。
- [Streamlit 客户端与服务器架构](https://docs.streamlit.io/develop/concepts/architecture/architecture)：Streamlit 运行方式与服务器文件访问。
