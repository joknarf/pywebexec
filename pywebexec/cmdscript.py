import os
import sys
import msvcrt
import shutil
import time
import signal
from datetime import datetime   
from winpty import PTY, WinptyError

class CmdInteractive:
    def __init__(self, logfile=None):
        self.logfile = logfile
        cols, rows = shutil.get_terminal_size()
        self.pty = PTY(cols, rows)
        # Set up Ctrl+C handling
        signal.signal(signal.SIGINT, self._handle_sigint)
        self.pid = self.pty.spawn('cmd.exe')
        if not self.pid:
            raise RuntimeError("Failed to spawn cmd.exe")
        self.command_buffer = []
        self.history = []
        self.history_index = 0
        self.cursor_pos = 0  # Track cursor position in command buffer

    def _handle_sigint(self, signum, frame):
        """Handle Ctrl+C by forwarding it to the child process"""
        try:
            self.pty.write('\x03')
        except:
            pass

    def log(self, text, direction='>>'):
        if self.logfile:
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')
            with open(self.logfile, 'a', encoding='utf-8') as f:
                f.write(f'{timestamp} {direction} {text}')

    def handle_special_key(self, char):
        """Handle special key sequences"""
        if char == b'\xe0':  # Extended key
            key = msvcrt.getch()
            if key == b'H':  # Up arrow
                if self.history and self.history_index > 0:
                    self.history_index -= 1
                    cmd = self.history[self.history_index]
                    self._replace_line(cmd)
            elif key == b'P':  # Down arrow
                if self.history_index < len(self.history) - 1:
                    self.history_index += 1
                    cmd = self.history[self.history_index]
                    self._replace_line(cmd)
            elif key == b'K':  # Left arrow
                if self.cursor_pos > 0:
                    self.cursor_pos -= 1
                    self.pty.write('\x1b[D')
            elif key == b'M':  # Right arrow
                if self.cursor_pos < len(self.command_buffer):
                    self.cursor_pos += 1
                    self.pty.write('\x1b[C')
            return True
        return False

    def _replace_line(self, new_text):
        """Replace current line with new text"""
        # Clear current line
        self.pty.write('\r' + ' ' * len(self.command_buffer) + '\r')
        # Write new line
        self.command_buffer = list(new_text)
        self.cursor_pos = len(self.command_buffer)
        self.pty.write(''.join(self.command_buffer))

    def interact(self):
        try:
            while True:
                try:
                    try:
                        output = self.pty.read()
                        if output:
                            if isinstance(output, str):
                                output = output.encode('utf-8')
                            sys.stdout.buffer.write(output)
                            sys.stdout.buffer.flush()
                            self.log(output.decode('utf-8', errors='replace'), '>>')
                    except (EOFError, WinptyError):
                        break

                    if msvcrt.kbhit():
                        char = msvcrt.getch()
                        if self.handle_special_key(char):
                            continue
                        
                        if char == b'\r':  # Enter
                            self.pty.write('\r\n')
                            if self.command_buffer:
                                cmd = ''.join(self.command_buffer)
                                self.history.append(cmd)
                                self.history_index = len(self.history)
                            self.command_buffer = []
                            self.cursor_pos = 0
                        elif char == b'\x08':  # Backspace
                            if self.cursor_pos > 0:
                                # Remove character at cursor position
                                self.command_buffer.pop(self.cursor_pos - 1)
                                self.cursor_pos -= 1
                                # Rewrite the line from cursor position
                                remain = ''.join(self.command_buffer[self.cursor_pos:])
                                self.pty.write('\x08' + remain + ' ')
                                # Move cursor back to position
                                if remain:
                                    self.pty.write('\x1b[' + str(len(remain)) + 'D')
                        elif char == b'\x03':  # Ctrl+C
                            self.pty.write('\x03')
                            self.command_buffer = []
                            self.cursor_pos = 0
                            continue
                        else:
                            # Insert character at cursor position
                            if isinstance(char, bytes):
                                char = char.decode('cp437', errors='replace')
                            self.command_buffer.insert(self.cursor_pos, char)
                            self.cursor_pos += 1
                            # Write new char and remaining text
                            remain = ''.join(self.command_buffer[self.cursor_pos-1:])
                            self.pty.write(remain)
                            # Move cursor back if needed
                            if self.cursor_pos < len(self.command_buffer):
                                self.pty.write('\x1b[' + str(len(remain)-1) + 'D')
                        self.log(char, '<<')

                except (IOError, OSError) as e:
                    if "handle is closed" in str(e):
                        break
                    raise

        except KeyboardInterrupt:
            pass
        finally:
            self.close()

    def close(self):
        if hasattr(self, 'pty'):
            del self.pty

if __name__ == '__main__':
    log_file = 'cmd_session.log'
    try:
        cmd = CmdInteractive(log_file)
        cmd.interact()
    except ImportError:
        print("Please install pywinpty: pip install pywinpty")
