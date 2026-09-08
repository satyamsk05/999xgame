import 'package:flutter_test/flutter_test.dart';

import 'package:ingames/main.dart';

void main() {
  testWidgets('InGames login screen smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const InGamesApp());

    // The app starts unauthenticated in a fresh test environment, so the
    // stable login-screen copy is the correct smoke-test contract.
    expect(find.text('Play'), findsOneWidget);
    expect(find.text('Fast. Secure. More Fun.'), findsOneWidget);
  });
}
