from pathlib import Path
import subprocess

p = Path('lib/screens/login_screen.dart')
lines = p.read_text().splitlines()
marker = '// Log error for debugging (visible in flutter logs)} catch (e) {'
idx = next(i for i, line in enumerate(lines) if marker in line)
start = next(i for i in range(idx - 3, idx + 1) if lines[i].strip() == '} catch (e) {')
end = next(i for i in range(idx, len(lines)) if lines[i].strip() == '// Log error for debugging (visible in flutter logs)}')
indent = lines[start].split('}')[0]
block = [
    indent + '} catch (e) {',
    indent + '  if (e is ApiException) {',
    indent + '    const retryableStatuses = <int>{0, 408, 429, 500, 502, 503, 504};',
    indent + '    final status = e.statusCode ?? 0;',
    indent + '    if (!retryableStatuses.contains(status)) {',
    indent + '      _isVerifyingActive = false;',
    indent + '      if (mounted) {',
    indent + '        setState(() {',
    indent + '          _isLoading = false;',
    indent + '          _statusMessage = null;',
    indent + '          _errorMessage = e.message;',
    indent + '          _currentStep = 0;',
    indent + '        });',
    indent + '      }',
    indent + '      return;',
    indent + '    }',
    indent + '  }',
    indent + "  debugPrint('[LoginVerify] transient error: $e');",
    indent + '  await Future.delayed(const Duration(milliseconds: 1500));',
    indent + '}',
]
lines[start:end + 1] = block
p.write_text('\n'.join(lines) + '\n')

subprocess.run(['git', 'config', 'user.name', 'github-actions[bot]'], check=True)
subprocess.run(['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], check=True)
subprocess.run(['git', 'add', 'lib/screens/login_screen.dart'], check=True)
subprocess.run(['git', 'commit', '-m', 'fix: repair login verification fail-closed block'], check=True)
subprocess.run(['git', 'push'], check=True)
