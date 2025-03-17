[![Pypi version](https://img.shields.io/pypi/v/pywebexec.svg)](https://pypi.org/project/pywebexec/)
![Publish Package](https://github.com/joknarf/pywebexec/actions/workflows/python-publish.yml/badge.svg)
[![Licence](https://img.shields.io/badge/licence-MIT-blue.svg)](https://shields.io/)
[![PyPI Downloads](https://static.pepy.tech/badge/pywebexec)](https://pepy.tech/projects/pywebexec)
[![Python versions](https://img.shields.io/badge/python-3.6+-blue.svg)](https://shields.io/)

# pywebexec
Simple Python HTTP(S) API/Web Server Command Launcher and Terminal sharing

* build a Restfull API/swagger-ui powered application in no time exposing simple commands/parameters.
* create a toolbox with batch management/parallel execution of commands
* share a terminal in one command
  
## Install
```
$ pip install pywebexec
```

## Quick start

* share terminal
  * start http server and spawn a new terminal shared on 0.0.0.0 port 8080 (defaults)
  * exiting terminal stops server/share
```shell
$ pywebexec shareterm
```

* serve executables
  * put in a directory the scripts/commands/links to commands you want to expose
  * start http server serving current directory executables listening on 0.0.0.0 port 8080
```shell
$ pywebexec -d <dir>
```

* Launch commands with params/view live output/Status using browser
* Share your terminal output using `pywebexec -d <dir> term`

![pywebexecnew11](https://github.com/user-attachments/assets/5acb15a7-92a4-4711-9de7-630721cbf47a)

all commands output / statuses are available in the executables directory in subdirectory `.web_status`

## features

* Serve executables in a directory
* full API driven with dynamic swagger UI
* Launch commands with params from web browser or API call
* multiple share terminal output
* Follow live output
* Replay terminal history
* Stop command
* Relaunch command
* HTTPS support
* HTTPS self-signed certificate generator
* Basic Auth
* LDAP(S) password check/group member
* Safe url token generation
* Can be started as a daemon (POSIX)
* Uses gunicorn to serve http/https
* Linux/MacOS compatible
* Markdown help for commands
* YAML schema for commands parameters
* Batch/parallel command execution

## Customize server
```shell
$ pywebexec --dir ~/myscripts --listen 0.0.0.0 --port 8080 --title myscripts
$ pywebexec -d ~/myscripts -l 0.0.0.0 -p 8080 -t myscripts
```

## Sharing terminals

* start server and share tty in one command
```shell
$ pywebexec -d ~/webshare shareterm
```
* share tty with an already pywebexec server started
```shell
$ pywebexec -d ~/webshare term
```
if another user need to share his terminal, he need to have write permission on `<dir>/.web_status` directory.

## Safe url token

* generate safe url, use the url to access the server
```shell
$ pywebexec -T
$ pywebexec --tokenurl
Starting server:
http://<host>:8080?token=jSTWiNgEVkddeEJ7I97x2ekOeaiXs2mErRSKNxm3DP0
http://x.x.x.x:8080?token=jSTWiNgEVkddeEJ7I97x2ekOeaiXs2mErRSKNxm3DP0
```

## Basic auth

* single user/password
```shell
$ pywebexec --user myuser [--password mypass]
$ pywebexec -u myuser [-P mypass]
```
Generated password is given if no `--pasword` option

* ldap(s) password check / group member
ldap server must accept memberOf attribute for group members
```shell
$ export PYWEBEXEC_LDAP_SERVER=ldaps://ldap.mydomain.com:389
$ export PYWEBEXEC_LDAP_BIND_DN="cn=read-only-admin,dc=example,dc=com"
$ export PYWEBEXEC_LDAP_BIND_PASSWORD="password"
$ export PYWEBEXEC_LDAP_BASE_DN="dc=example,dc=com"
$ export PYWEBEXEC_LDAP_USER_ID="uid" # sAMAccountName for AD
$ export PYWEBEXEC_LDAP_GROUPS="ou=mathematicians,dc=example,dc=com ou=scientists,dc=example,dc=com"
$ pywebexec
```
## HTTPS server

* Generate auto-signed certificate and start https server
```shell
$ pywebexec --gencert
$ pywebexec --g
```

* Start https server using existing certificate
```shell
$ pywebexec --cert /pathto/host.cert --key /pathto/host.key
$ pywebexec -c /pathto/host.cert -k /pathto/host.key
```

## Launch server as a daemon

```shell
$ pywebexec start
$ pywebexec status
$ pywebexec stop
```
* log of server are stored in directory `~/[.config/].pywebexec/pywebexec_<listen>:<port>.log`

## Launch command through API

```shell
$ curl http://myhost:8080/commands/myscript -H 'Content-Type: application/json' -X POST -d '{"params":["param1", ...]}'
$ curl http://myhost:8080/commands/<command_id>
$ curl http://myhost:8080/commands/<command_id>/output -H "Accept: text/plain"
```

## Add markdown help to commands

For each exposed command, you can add a help message by creating a file named `<command>.help` in the same directory as the command. The help message must be written in markdown.  
The help message is displayed:
* in the web interface as tooltip when focused on param input field,
* in the response when calling the API `/executables`
* in the swagger-ui in the `/commands/<command>` route.

<img src="https://github.com/user-attachments/assets/2d69cef2-3371-4282-99bb-e994eb0c0b24" width="400"/>

## Add schema to commands

For each exposed command, you can add a schema by creating a file named `<command>.schema.yaml` in the same directory as the command. The schema must be written in yaml format.  
The schema is used to generate a form in the web interface and in the swagger-ui in the `/commands/<command>` route.  
The schema is also used to validate the input parameters when calling the API `/commands/<command>`.  
The schema must be written in the openapi schema format.

```yaml
type: object
properties:
  param1:
    type: string
    description: "param1 description"
    example: "value"
  param2:
    type: integer
    description: "param2 description"
    enum: [1, 2, 3]
  param3:
    type: array
    items:
      type: string
    description: "param3 description"
    example: ["value1", "value2"]
required:
  - param1
  - param2
```
The payload will be converted to command line arguments when calling the command.
```
command --param1 value --param2 1 --param3 value1 value2
```

* On the web inferface, and swagger-ui the form will be generated from the schema.

<img src="https://github.com/user-attachments/assets/c7cdf117-aa38-4366-97c7-1aa26e5ebf0d" width="400">

When using schema, the command can now be launched with:
```
$ curl -X POST http://<srv>/commands/<cmd> -H "Content-Type: application/json" -d '{"param1": "value", "param2": 1, "param3": ["value1", "value2"]}'
```

## Schema options

The schema options are used to customize the command line arguments generation, just add a `schema_options` section to the schema.
```yaml
schema_options:
  separator_params: {"*": " ", "param2": "="}}"=" # --param2=value (default is " ") 
  noprefix_params: ["param1", "param2"] # omit --param prefix, use "*" to omit all
  convert_params: {"param1": "param2"} # convert param1 to param2
```

## Batch commands/parallel execution

Integration of [run-para](https://github.com/joknarf/run-para) to enable batch execution of commands:
* In `schema_options` adding `batch_param` will enable batch mode for the command, the command will be executed for each value in the `batch_param` list.  
* The `batch_param` is the name of the parameter that will be used to pass the different values for the parameter.  
* The `batch_param` type will be transformed to textarea to provide list to use as parameter for the command.  
* The range parameters `parallel` and `delay` is added to the command parameters to control the execution of the batch commands (nb jobs in parallel and initial delay between jobs). 

<img src="https://github.com/user-attachments/assets/a25bf197-5c2e-4cec-9dd7-53f83c11656f" width="400">


## Swagger UI

A custom swagger UI is available at `http[s]://<srv>/v0/documentation` with enhanced markdown rendering and form generation for body parameters.

<img src="https://github.com/user-attachments/assets/c80a341e-c04c-4606-9510-a57b473a74e5" width="400"/>

<img src="https://github.com/user-attachments/assets/22261048-459e-4ace-8d04-c568d67bef37" width="400">


## API reference


| method    | route                       | params/payload     | returns
|-----------|-----------------------------|--------------------|---------------------|
| GET       | /commands/exposed           |                    | commands: [<br>&nbsp;&nbsp;{<br>&nbsp;&nbsp;&nbsp;&nbsp;command: str,<br>&nbsp;&nbsp;&nbsp;&nbsp;help: str<br>&nbsp;&nbsp;},<br>]        |
| GET       | /commands                   |                    | commands: [<br>&nbsp;&nbsp;{<br>&nbsp;&nbsp;&nbsp;&nbsp;command_id: uuid<br>&nbsp;&nbsp;&nbsp;&nbsp;command: str<br>&nbsp;&nbsp;&nbsp;&nbsp;start_time: isotime<br>&nbsp;&nbsp;&nbsp;&nbsp;end_time: isotime<br>&nbsp;&nbsp;&nbsp;&nbsp;status: str<br>&nbsp;&nbsp;&nbsp;&nbsp;exit_code: int<br>&nbsp;&nbsp;&nbsp;&nbsp;last_output_line: str<br>&nbsp;&nbsp;},<br>]      |
| GET       | /commands/{id}              |                    | command_id: uuid<br>command: str<br>params: array[str]<br>start_time: isotime<br>end_time: isotime<br>status: str<br>exit_code: int<br>last_output_line: str      |
| GET       | /commands/{id}/output       | offset: int        | output: str<br>status: str<br>links: { next: str }         |
| GET       | /commands/{id}/output_raw   | offset: int        | output: stream raw output until end of command<br>curl -Ns http://srv/commands/{id}/output_raw|
| POST      | /commands                   | command: str<br>params: array[str]<br>rows: int<br>cols: int       | command_id: uuid<br>message: str    |
| POST      | /commands/{cmd}             | params: array[str]<br>rows: int<br>cols: int       | command_id: uuid<br>message: str    |
| PATCH     | /commands/{id}/stop        |                    | message: str        |

* to get command output as text (without ANSI codes/Control characters) use: `/commands/{id}/output` with header `"Accept: text/plain"`
