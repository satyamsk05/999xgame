import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web/web.dart' as web;
import '../core/api/api_client.dart';
import '../core/storage/token_manager.dart';
import 'api_service.dart';

/// Lightweight browser-compatible realtime synchronizer.
///
/// The backend is authoritative. Realtime messages are treated as hints/events;
/// after reconnect the service re-reads the authoritative REST state instead of
/// assuming that no events were missed while offline.
class RealtimeSyncService {
  static final RealtimeSyncService instance = RealtimeSyncService._();
  RealtimeSyncService._();

  Timer? _reconnectTimer;
  bool _running = false;
  bool _refreshInFlight = false;
  int _reconnectAttempt = 0;
  web.WebSocket? _socket;

  final ValueNotifier<bool> isConnected = ValueNotifier<bool>(false);
  final ValueNotifier<Map<String, dynamic>?> lastEvent = ValueNotifier<Map<String, dynamic>?>(null);

  Future<void> start() async {
    if (_running) return;
    _running = true;
    await _connect();
  }

  Future<void> stop() async {
    _running = false;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _socket?.close();
    _socket = null;
    isConnected.value = false;
  }

  Future<void> _connect() async {
    if (!_running || !TokenManager.isAuthenticated) {
      _scheduleReconnect();
      return;
    }

    try {
      final wsUrl = _buildWebSocketUrl(ApiService.serverDomain, TokenManager.token!);
      final socket = web.WebSocket(wsUrl);
      _socket = socket;

      socket.onopen = (_) async {
        if (!_running) return;
        _reconnectAttempt = 0;
        isConnected.value = true;
        await _refreshAuthoritativeState();
      };

      socket.onmessage = (web.MessageEvent event) {
        _handleMessage(event.data);
      };

      socket.onerror = (_) {
        isConnected.value = false;
      };

      socket.onclose = (_) {
        isConnected.value = false;
        _socket = null;
        _scheduleReconnect();
      };
    } catch (_) {
      isConnected.value = false;
      _scheduleReconnect();
    }
  }

  String _buildWebSocketUrl(String serverDomain, String token) {
    final uri = Uri.parse(serverDomain);
    final scheme = uri.scheme == 'https' ? 'wss' : 'ws';
    return Uri(
      scheme: scheme,
      host: uri.host,
      port: uri.hasPort ? uri.port : null,
      path: '/socket.io/',
      queryParameters: {'token': token},
    ).toString();
  }

  void _handleMessage(dynamic raw) {
    if (raw is! String) return;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) {
        lastEvent.value = decoded;
        final type = decoded['type']?.toString();
        if (type == 'GAME_ROUND_SETTLED' || type == 'GAME_RESULT' || type == 'WALLET_UPDATED') {
          _refreshAuthoritativeState();
        }
      }
    } catch (_) {
      // Socket.IO framing is not guaranteed to be plain JSON here.
    }
  }

  void _scheduleReconnect() {
    if (!_running || _reconnectTimer != null) return;
    final delaySeconds = [1, 2, 4, 8, 15, 30][(_reconnectAttempt++).clamp(0, 5)];
    _reconnectTimer = Timer(Duration(seconds: delaySeconds), () async {
      _reconnectTimer = null;
      await _connect();
    });
  }

  Future<void> _refreshAuthoritativeState() async {
    if (_refreshInFlight || !TokenManager.isAuthenticated) return;
    _refreshInFlight = true;
    try {
      await ApiService.getUserProfile();
      await ApiService.getGamesList();
    } catch (_) {
      // Reconnect loop handles transport failures; do not overwrite authoritative
      // state with stale local data when refresh fails.
    } finally {
      _refreshInFlight = false;
    }
  }
}
