import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as socket_io;
import '../core/storage/token_manager.dart';
import 'api_service.dart';

/// Authoritative realtime synchronization for the Flutter client.
class RealtimeSyncService {
  static final RealtimeSyncService instance = RealtimeSyncService._();
  RealtimeSyncService._();

  socket_io.Socket? _socket;
  bool _running = false;
  bool _refreshInFlight = false;

  Future<void> Function()? onAuthoritativeRefresh;

  final ValueNotifier<bool> isConnected = ValueNotifier<bool>(false);
  final ValueNotifier<Map<String, dynamic>?> lastEvent =
      ValueNotifier<Map<String, dynamic>?>(null);

  Future<void> start() async {
    if (_running) return;
    _running = true;
    await _connect();
  }

  Future<void> stop() async {
    _running = false;
    _socket?.dispose();
    _socket = null;
    isConnected.value = false;
  }

  Future<void> _connect() async {
    if (!_running || !TokenManager.isAuthenticated) return;

    _socket?.dispose();
    _socket = null;

    try {
      final token = TokenManager.token;
      if (token == null || token.isEmpty) return;

      final socket = socket_io.io(
        ApiService.serverDomain,
        socket_io.OptionBuilder()
            .setTransports(['websocket'])
            .setAuth({'token': token})
            .enableReconnection()
            .setReconnectionAttempts(999999)
            .setReconnectionDelay(1000)
            .setReconnectionDelayMax(30000)
            .build(),
      );

      _socket = socket;

      socket.onConnect((_) async {
        if (!_running || !identical(_socket, socket)) return;
        isConnected.value = true;
        await _refreshAuthoritativeState();
      });

      socket.onDisconnect((_) {
        if (identical(_socket, socket)) isConnected.value = false;
      });

      // Socket.IO already owns reconnect/backoff for connection errors. Do not
      // create a second timer that can race it and create duplicate sockets.
      socket.onConnectError((_) {
        if (identical(_socket, socket)) isConnected.value = false;
      });

      socket.onError((_) {
        if (identical(_socket, socket)) isConnected.value = false;
      });

      for (final eventName in const [
        'GAME_ROUND_OPEN',
        'GAME_BETTING_CLOSED',
        'GAME_RESULT',
        'GAME_ROUND_SETTLED',
        '7ud:round_open',
        '7ud:dice_rolled',
        '7ud:round_settled',
        'dt:round_open',
        'dt:result',
        'dt:round_settled',
        'crush:round_open',
        'crush:result',
        'crush:round_settled',
      ]) {
        socket.on(eventName, (data) => _handleRealtimeEvent(eventName, data));
      }
    } catch (_) {
      isConnected.value = false;
      // This only covers socket construction/runtime failures. Normal network
      // reconnects are handled by Socket.IO itself.
      await Future<void>.delayed(const Duration(seconds: 5));
      if (_running && !isConnected.value) await _connect();
    }
  }

  void _handleRealtimeEvent(String eventName, dynamic data) {
    lastEvent.value = <String, dynamic>{
      'name': eventName,
      'data': data,
      'receivedAt': DateTime.now().toUtc().toIso8601String(),
    };

    if (eventName == 'GAME_ROUND_SETTLED' ||
        eventName == 'GAME_RESULT' ||
        eventName.endsWith(':round_settled') ||
        eventName.endsWith(':result')) {
      _refreshAuthoritativeState();
    }
  }

  Future<void> _refreshAuthoritativeState() async {
    if (_refreshInFlight || !_running || !TokenManager.isAuthenticated) return;
    _refreshInFlight = true;
    try {
      await ApiService.getUserProfile();
      final callback = onAuthoritativeRefresh;
      if (callback != null) await callback();
    } catch (_) {
      // Never replace authoritative data with a local guess.
    } finally {
      _refreshInFlight = false;
    }
  }
}
