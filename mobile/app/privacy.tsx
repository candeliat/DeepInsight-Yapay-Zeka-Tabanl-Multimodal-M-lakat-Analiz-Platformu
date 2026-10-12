import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Colors } from '../src/constants/Colors';
import { FontFamilies } from '../src/constants/Fonts';
import { Card, Screen } from '../src/components/ui';
import { PRIVACY_NOTICE, PRIVACY_NOTICE_VERSION } from '../src/constants/privacyNotice';

/** KVKK aydınlatma metni — oturum gerektirmez (kayıt ekranından açılır). */
export default function PrivacyScreen() {
  return (
    <Screen title="KVKK Aydınlatma Metni" subtitle={`Sürüm ${PRIVACY_NOTICE_VERSION}`} icon="shield-checkmark-outline">
      {PRIVACY_NOTICE.map((section) => (
        <Card key={section.title}>
          <Text style={styles.heading}>{section.title}</Text>
          {section.body.map((p, i) => (
            <Text key={i} style={styles.body}>
              {p}
            </Text>
          ))}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 15, fontFamily: FontFamilies.sansBold, color: Colors.onSurface, marginBottom: 8 },
  body: { fontSize: 14, fontFamily: FontFamilies.sansRegular, color: Colors.onSurfaceVariant, lineHeight: 21, marginBottom: 6 },
});
