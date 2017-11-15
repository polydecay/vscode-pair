# VSCode-Pair (Alpha)
VSCode-Pair is a pair programming extension aiming to make it quick and easy for multiple people to view and edit the same documents in real-time.

*VSCode-Pair does not depend on any external services and the server can be run directly from VSCode.*

## Getting Started
**NOTE: Please make sure you have a backup of your project before using this extension!**

### Connecting to a Server
1. Open the command palette `Ctrl+Shift+P` and select the `VSCodePair: Connect` option.
2. Enter the IP address and port to the server you want to connect to *(e.g. `10.0.0.1:8000`)*.

*Run the `VSCodePair: Disconnect` command to disconnect from the server.*

### Running a Server
1. Configure your server port by adding the `vscodePair.server.port` to your VSCode configuration.
2. Open the command palette `Ctrl+Shift+P` and select the `VSCodePair: Start Server` option. *(There's no need to connect to your own server as that's done automatically.)*

*Run the `VSCodePair: Stop Server` command to stop the server.*

## Known Issues
This extension was originally intended to only support one writer at a time, so while it does support multiple writers right now, there's some drawbacks you need to be aware of.

+ Make sure you're using LF line endings as CRLF is not handled correctly atm.
+ The undo stack gets mangled when multiple people are writing at the same time.
+ VSCode-Pair does not synchronize the project files when connecting. *(Use git for the initial synchronization for now)*

## License
Licensed under [The MIT License (MIT)](https://opensource.org/licenses/MIT) - Copyright &copy; 2017 Kim Simonsen.
