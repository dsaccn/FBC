Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
posDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = posDir

cloudflaredPath = posDir & "\bin\cloudflared.exe"
needsDownload = False

If Not fso.FileExists(cloudflaredPath) Then
    needsDownload = True
Else
    Set fileObj = fso.GetFile(cloudflaredPath)
    If fileObj.Size < 20000000 Then
        needsDownload = True
    End If
End If

If needsDownload Then
    ' Download cloudflared visibly so the user can see progress
    WshShell.Run """" & posDir & "\start-cloudflare.bat""", 1, False
    WScript.Quit
End If

If Not fso.FolderExists(posDir & "\logs") Then
    fso.CreateFolder(posDir & "\logs")
End If

' 0 = Hide window completely. Runs Cloudflare tunnel silently in background with logging.
WshShell.Run """" & posDir & "\scripts\run_tunnel.bat""", 0, False
