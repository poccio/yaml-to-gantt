Output terminal.gif

Set Shell "bash"
Set FontSize 14
Set Width 1280
Set Height 720
Set Theme "Dracula"
Set Padding 16
Set TypingSpeed 80ms

Type "nano roadmap.yaml"
Sleep 200ms
Enter
Sleep 400ms

# >>> ROADMAP <<<   generate-gif.sh replaces this line with the contents of roadmap.yaml
Sleep 800ms

Ctrl+X
Type "y"
Sleep 100ms
Enter
Sleep 100ms

Type "npx --yes yaml-to-gantt roadmap.yaml"
Enter
Sleep 2s
