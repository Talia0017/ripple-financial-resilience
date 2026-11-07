#!/bin/zsh
set -eu
cd "$(dirname "$0")"
if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
fi
if ! .venv/bin/python -c 'import pandas, streamlit' >/dev/null 2>&1; then
  echo 'First launch: installing Pandas and Streamlit. A network connection is required.'
  .venv/bin/python -m pip install -r requirements.txt || {
    echo 'Dependency installation failed. Keep the error details in this window.'
    read '?Press Enter to close…'
    exit 1
  }
fi
echo 'Opening Ripple in your browser: http://localhost:8501'
echo 'Keep this window open. Press Control+C here to stop the app.'
exec .venv/bin/python -m streamlit run app.py --server.address 127.0.0.1 --server.port 8501 --server.showEmailPrompt false --browser.gatherUsageStats false
