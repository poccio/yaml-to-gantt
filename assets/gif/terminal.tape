Output terminal.gif

Set Shell "bash"
Set FontSize 14
Set Width 1280
Set Height 720
Set Theme "Dracula"
Set Padding 16
Set TypingSpeed 100ms

Type "nano roadmap.yaml"
Sleep 200ms
Enter
Sleep 400ms

Type "projects:"
Enter
Type "  ProductX:"
Enter
Type "    - name: Design"
Enter
Type "      start: 2026-05-01"
Enter
Type "      end: 2026-05-14"
Enter
Type "      assignees: [ Alice ]"
Enter
Type "    - name: Development"
Enter
Type "      start: 2026-05-12"
Enter
Type "      end: 2026-05-30"
Enter
Type "      assignees: [ Bob, Carol ]"
Enter
Sleep 400ms

Ctrl+X
Type "y"
Sleep 100ms
Enter
Sleep 100ms

Type "npx --yes yaml-to-gantt roadmap.yaml"
Enter
Sleep 2s
