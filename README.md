[![Pypi version](https://img.shields.io/pypi/v/pywebexec.svg)](https://pypi.org/project/pywebexec/)
![example](https://github.com/joknarf/pywebexec/actions/workflows/python-publish.yml/badge.svg)
[![Licence](https://img.shields.io/badge/licence-MIT-blue.svg)](https://shields.io/)
[![PyPI Downloads](https://static.pepy.tech/badge/pywebexec)](https://pepy.tech/projects/pywebexec)
[![Python versions](https://img.shields.io/badge/python-3.6+-blue.svg)](https://shields.io/)

# pywebexec
Simple Python HTTP(S) API/Web Command Launcher and Terminal sharing

## Install
```
$ pip install pywebexec
```

## Quick start

* share terminal
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
```shell
$ export PYWEBEXEC_LDAP_SERVER=ldap://ldap.forumsys.com:389
$ export PYWEBEXEC_LDAP_BIND_DN="cn=read-only-admin,dc=example,dc=com"
$ export PYWEBEXEC_LDAP_BIND_PASSWORD="password"
$ export PYWEBEXEC_LDAP_GROUPS="ou=mathematicians,ou=scientists"
$ export PYWEBEXEC_LDAP_USER_ID="uid"
$ export PYWEBEXEC_LDAP_BASE_DN="dc=example,dc=com"
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
$ curl http://myhost:8080/run_command -H 'Content-Type: application/json' -X POST -d '{ "command":"myscript", "params":["param1", ...]}'
$ curl http://myhost:8080/command_status/<command_id>
$ curl http://myhost:8080/command_output/<command_id> -H "Accept: text/plain"
```

## API reference


| method    | route                       | params/payload     | returns
|-----------|-----------------------------|--------------------|---------------------|
| POST      | /run_command                | command: str<br>params: array[str]       | command_id: uuid<br>message: str    |
| POST      | /stop_command/command_id    |                    | message: str        |
| GET       | /command_status/command_id  |                    | command_id: uuid<br>command: str<br>params: array[str]<br>start_time: isotime<br>end_time: isotime<br>status: str<br>exit_code: int<br>last_output_line: str      |
| GET       | /command_output/command_id  | offset: int        | output: str<br>status: str<br>links: { next: str }         |
| GET       | /commands                   |                    | array of<br>command_id: uuid<br>command: str<br>start_time: isotime<br>end_time: isotime<br>status: str<br>exit_code: int<br>last_output_line: str      |
| GET       | /executables                |                    | array of str        |
