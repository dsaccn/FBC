Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
posDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = posDir

' Strip read-only attributes and grant write permissions to database
WshShell.Run "cmd.exe /c ""attrib -r -s -h """ & posDir & "\prisma\*""" & " /s /d & attrib -r -s -h """ & posDir & "\prisma\kogna.db*""""", 0, True

' Start Cloudflare Tunnel silently for mobile phone scanner
If fso.FileExists(posDir & "\bin\cloudflared.exe") Then
    WshShell.Run "cmd.exe /c """ & posDir & "\scripts\run_tunnel.bat""", 0, False
End If


' 0 = Hide window completely. Runs server silently in the background.
WshShell.Run "cmd.exe /c ""set PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm;C:\Program Files (x86)\nodejs && npm start""", 0, False
