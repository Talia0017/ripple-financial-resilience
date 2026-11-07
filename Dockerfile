FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8501

WORKDIR /app

COPY financial_resilience/requirements.txt ./financial_resilience/requirements.txt
RUN python -m pip install --no-cache-dir -r financial_resilience/requirements.txt \
    && groupadd --system ripple \
    && useradd --system --gid ripple --create-home ripple

# Explicit source allowlist: never copy banking CSVs, secrets, or a local venv.
COPY financial_resilience/app.py financial_resilience/data_access.py financial_resilience/engine.py ./financial_resilience/

USER ripple
EXPOSE 8501

CMD ["sh", "-c", "exec python -m streamlit run financial_resilience/app.py --server.address=0.0.0.0 --server.port=\"${PORT:-8501}\" --server.headless=true --server.showEmailPrompt=false --server.fileWatcherType=none --browser.gatherUsageStats=false"]
