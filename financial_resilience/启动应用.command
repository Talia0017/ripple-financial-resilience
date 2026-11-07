#!/bin/zsh
set -eu
cd "$(dirname "$0")"
if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
fi
if ! .venv/bin/python -c 'import pandas, streamlit' >/dev/null 2>&1; then
  echo '首次启动：正在安装 Pandas 和 Streamlit，需要网络。'
  .venv/bin/python -m pip install -r requirements.txt || {
    echo '依赖安装失败。请保留这个窗口中的错误信息。'
    read '?按回车关闭…'
    exit 1
  }
fi
echo '应用即将在浏览器中打开：http://localhost:8501'
echo '请保留此窗口。需要停止时，在此窗口按 Control+C。'
exec .venv/bin/python -m streamlit run app.py --server.address 127.0.0.1 --server.port 8501 --server.showEmailPrompt false --browser.gatherUsageStats false
