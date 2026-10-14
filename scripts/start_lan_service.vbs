Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File ""c:\Users\dawit\OneDrive\Documents\managment\FBC\scripts\start_lan_service.ps1""", 0, False
