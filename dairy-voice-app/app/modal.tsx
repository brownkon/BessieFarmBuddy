import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Fonts, IndustrialColors, IndustrialTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ModalScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? IndustrialColors.dark : IndustrialColors.light;
  const fonts = Fonts;

  return (
    <View style={[styles.container, { backgroundColor: palette.canvas }]}>
      <View style={[styles.card, { backgroundColor: palette.plate, borderColor: palette.plateBorder }]}> 
        <Text style={[styles.title, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>SYSTEM PANEL</Text>
        <Text style={[styles.body, { color: palette.textMuted, fontFamily: fonts.condensed }]}>This is a modal.</Text>
        <Link href="/" dismissTo style={[styles.link, { borderColor: palette.safetyOrange }]}> 
          <Text style={[styles.linkText, { color: palette.safetyOrange, fontFamily: fonts.condensedBold }]}>Go to home screen</Text>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    borderWidth: IndustrialTheme.border.heavy,
    borderRadius: IndustrialTheme.radius.card,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 32,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  body: {
    fontSize: 16,
  },
  link: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: IndustrialTheme.border.heavy,
    borderRadius: IndustrialTheme.radius.control,
    alignSelf: 'flex-start',
  },
  linkText: {
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
});
