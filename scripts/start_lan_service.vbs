Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File """ & scriptDir & "\start_lan_service.ps1""", 0, False
