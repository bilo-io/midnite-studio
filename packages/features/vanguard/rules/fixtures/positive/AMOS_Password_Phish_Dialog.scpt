set pw to text returned of (display dialog "Please enter your password to continue." default answer "" with hidden answer)
do shell script "dscl . authonly " & user & " " & pw
