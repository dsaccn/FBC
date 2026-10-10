Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
posDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = posDir

' 0 = Hide window completely. Runs server silently in the background.
WshShell.Run "cmd.exe /c ""set PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm;C:\Program Files (x86)\nodejs && npm start""", 0, False

' Wait 3 seconds for the server to initialize, then launch the browser
WScript.Sleep 3000
WshShell.Run "http://localhost:3000"
