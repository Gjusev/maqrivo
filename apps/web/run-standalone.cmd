@echo off
rem Local launcher for the standalone Next server (loads .env, then execs node).
for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do set "%%a=%%b"
node ".next/standalone/apps/web/server.js"
