; Custom NSIS include for electron-builder (package.json -> build.nsis.include)
; - after the "for whom" page, detects an installed Postwoman (of that scope) and offers: update / remove / exit,
;   showing the installed build and the build it will be updated to
; - writes the build number into the registry (PwBuild) so the next installer can compare
; - uninstaller asks whether to delete user data (settings, history, keys)
; Silent runs (/S) skip every question: the normal silent update flow is unchanged.

!ifndef BUILD_UNINSTALLER
  !include "${BUILD_RESOURCES_DIR}\buildinfo.nsh"
!endif

!macro customHeader
!ifndef BUILD_UNINSTALLER
  Var /GLOBAL pwOldVer
  Var /GLOBAL pwOldUninst
  Var /GLOBAL pwOldDir
  Var /GLOBAL pwOldBuild

  ; looks the previous installation up in the scope chosen on the "for whom" page
  Function pwDetect
    StrCpy $pwOldUninst ""
    StrCpy $pwOldVer ""
    StrCpy $pwOldDir ""
    StrCpy $pwOldBuild ""
    ${If} $installMode == "all"
      StrCpy $5 HKLM
    ${Else}
      StrCpy $5 HKCU
    ${EndIf}
    ${If} $5 == HKLM
      ReadRegStr $pwOldUninst HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
      ReadRegStr $pwOldVer HKLM "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
      ReadRegStr $pwOldDir HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
      ReadRegStr $pwOldBuild HKLM "${INSTALL_REGISTRY_KEY}" "PwBuild"
    ${Else}
      ReadRegStr $pwOldUninst HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
      ReadRegStr $pwOldVer HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
      ReadRegStr $pwOldDir HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
      ReadRegStr $pwOldBuild HKCU "${INSTALL_REGISTRY_KEY}" "PwBuild"
    ${EndIf}
  FunctionEnd

  ; asks what to do; returns in $0: "update" | "remove" | "exit"
  Function pwAsk
    System::Call 'kernel32::GetUserDefaultUILanguage() i.r1'
    IntOp $1 $1 & 0xFF
    ; compare builds (both are 6 digits; the leading 1 keeps them from being read as octal)
    StrCpy $3 "unknown"
    ${If} $pwOldBuild != ""
      StrCpy $6 "1$pwOldBuild"
      StrCpy $7 "1${PW_BUILD}"
      ${If} $6 < $7
        StrCpy $3 "newer"
      ${ElseIf} $6 == $7
        StrCpy $3 "same"
      ${Else}
        StrCpy $3 "older"
      ${EndIf}
    ${EndIf}
    ${If} $pwOldBuild == ""
      StrCpy $4 "?"
    ${Else}
      StrCpy $4 $pwOldBuild
    ${EndIf}
    ${If} $pwOldVer == ""
      StrCpy $8 "?"
    ${Else}
      StrCpy $8 $pwOldVer
    ${EndIf}
    ${If} $1 == 25
      StrCpy $2 "${PRODUCT_NAME} уже установлена.$\r$\n$\r$\nУстановлена: версия $8, сборка $4$\r$\nУстанавливаемая: версия ${VERSION}, сборка ${PW_BUILD}$\r$\n$\r$\n"
      ${If} $3 == "same"
        StrCpy $2 "$2Это та же сборка.$\r$\n$\r$\nДа  — переустановить (сборка ${PW_BUILD})$\r$\n"
      ${ElseIf} $3 == "older"
        StrCpy $2 "$2Установлена более новая сборка.$\r$\n$\r$\nДа  — откатить: сборка $4 → ${PW_BUILD}$\r$\n"
      ${Else}
        StrCpy $2 "$2Да  — обновить: сборка $4 → ${PW_BUILD}$\r$\n"
      ${EndIf}
      StrCpy $2 "$2Нет — удалить программу$\r$\nОтмена — выйти"
    ${Else}
      StrCpy $2 "${PRODUCT_NAME} is already installed.$\r$\n$\r$\nInstalled: version $8, build $4$\r$\nThis installer: version ${VERSION}, build ${PW_BUILD}$\r$\n$\r$\n"
      ${If} $3 == "same"
        StrCpy $2 "$2This is the same build.$\r$\n$\r$\nYes  - reinstall (build ${PW_BUILD})$\r$\n"
      ${ElseIf} $3 == "older"
        StrCpy $2 "$2A newer build is installed.$\r$\n$\r$\nYes  - roll back: build $4 -> ${PW_BUILD}$\r$\n"
      ${Else}
        StrCpy $2 "$2Yes  - update: build $4 -> ${PW_BUILD}$\r$\n"
      ${EndIf}
      StrCpy $2 "$2No   - uninstall the program$\r$\nCancel - exit"
    ${EndIf}
    MessageBox MB_YESNOCANCEL|MB_ICONQUESTION|MB_DEFBUTTON1 "$2" IDYES pwAskUpdate IDNO pwAskRemove
    StrCpy $0 "exit"
    Return
    pwAskUpdate:
      StrCpy $0 "update"
      Return
    pwAskRemove:
      StrCpy $0 "remove"
  FunctionEnd

  ; runs the old uninstaller and waits for it
  Function pwRemove
    ${If} $pwOldDir == ""
      ; fall back to the folder of the uninstaller from the registry value (the first quoted part)
      StrCpy $1 $pwOldUninst 1
      ${If} $1 == '"'
        StrCpy $2 $pwOldUninst "" 1
        StrCpy $3 0
        pwScan:
          StrCpy $4 $2 1 $3
          ${If} $4 == '"'
            StrCpy $2 $2 $3
            Goto pwScanDone
          ${EndIf}
          ${If} $4 == ""
            Goto pwScanDone
          ${EndIf}
          IntOp $3 $3 + 1
          Goto pwScan
        pwScanDone:
        ; cut the file name: scan from the end for the last backslash
        StrLen $3 $2
        pwBack:
          IntOp $3 $3 - 1
          ${If} $3 < 0
            Goto pwBackDone
          ${EndIf}
          StrCpy $4 $2 1 $3
          ${If} $4 != "\"
            Goto pwBack
          ${EndIf}
          StrCpy $pwOldDir $2 $3
        pwBackDone:
      ${EndIf}
    ${EndIf}
    ; "_?=" makes the uninstaller run in place and lets us wait for it (it must be the last parameter)
    ExecWait '$pwOldUninst _?=$pwOldDir' $0
    ; uninstaller cannot delete itself in this mode: clean up what is left
    ${If} $pwOldDir != ""
      Delete "$pwOldDir\Uninstall ${PRODUCT_FILENAME}.exe"
      RMDir "$pwOldDir"
    ${EndIf}
  FunctionEnd
  ; page callback: no UI of its own - asks the question and either quits or skips to the install
  Function pwPagePre
    ${If} ${Silent}
      Abort
    ${EndIf}
    Call pwDetect
    ${If} $pwOldUninst == ""
      Abort
    ${EndIf}
    Call pwAsk
    ${If} $0 == "remove"
      Call pwRemove
      SetErrorLevel 0
      Quit
    ${ElseIf} $0 == "exit"
      SetErrorLevel 0
      Quit
    ${EndIf}
    ; "update": the installer removes the old version by itself and keeps the settings
    Abort
  FunctionEnd
!endif
!macroend

; custom page right after the install-folder page: the "for whom" choice is already made
; (and the UAC restart, if any, already happened), so this question is asked exactly once
!macro customPageAfterChangeDir
  !ifndef BUILD_UNINSTALLER
    Page custom pwPagePre
  !endif
!macroend

!ifndef BUILD_UNINSTALLER
!macro customInstall
  WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "PwBuild" "${PW_BUILD}"
  WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "PwVersion" "${VERSION}"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion" "${VERSION}.${PW_BUILD}"
!macroend
!else
!macro customInstall
!macroend
!endif

; uninstaller: offer to delete the user data (not when it runs as a part of an update, not in silent mode)
!macro customUnInstall
  ${IfNot} ${isUpdated}
  ${AndIfNot} ${Silent}
    System::Call 'kernel32::GetUserDefaultUILanguage() i.r1'
    IntOp $1 $1 & 0xFF
    ${If} $1 == 25
      StrCpy $2 "Удалить также данные программы (настройки, историю, ключи шифрования секретных переменных)?$\r$\n$\r$\nКоллекции и переменные в вашей папке хранения не затрагиваются."
    ${Else}
      StrCpy $2 "Also delete the program data (settings, history, encryption keys of secret variables)?$\r$\n$\r$\nCollections and variables in your storage folder are not touched."
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "$2" IDNO pwKeepData
      ${If} $installMode == "all"
        SetShellVarContext current
      ${EndIf}
      RMDir /r "$APPDATA\${APP_FILENAME}"
      ${If} $installMode == "all"
        SetShellVarContext all
      ${EndIf}
    pwKeepData:
  ${EndIf}
!macroend
