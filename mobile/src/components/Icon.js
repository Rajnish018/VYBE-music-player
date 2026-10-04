import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { colors } from '../theme/theme';
export default function Icon({name,size=22,color=colors.text}){useTheme();return <Ionicons name={name} size={size} color={color}/>}
