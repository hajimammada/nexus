@echo off
for /f "tokens=3" %%i in ('query session ^| findstr /i "%USERNAME%"') do (
    tscon %%i /dest:console
)
