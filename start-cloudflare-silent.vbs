Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
posDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = posDir

' 0 = Hide window completely. Runs Cloudflare tunnel silently in background.
WshShell.Run "cmd.exe /c """"" & posDir & "\bin\cloudflared.exe"" tunnel --protocol http2 run --token eyJhIjoiM2UzNjljODU4YTllY2NhYTExNDkzZTIwNDhjODI0MmMiLCJ0IjoiZGM1ZTliYjYtNTU5Mi00YjgzLTlkMTMtYjA2MGExZmQyNzQzIiwicyI6Ik5tWmlNamMyWmpNdE5qVTBOQzAwWkRJNUxUZzBaVEl0T0dOak4ySTROemRpWlRrNSJ9", 0, False
