import Svg, { Circle, Path } from "react-native-svg";
import { useUnistyles } from "react-native-unistyles";

interface PaseoLogoProps {
  size?: number;
  color?: string;
}

const JIANSHAN_MOUNTAIN_PATH =
  "M72 548L246 214C263 180 283 180 300 214L372 358L446 202C463 168 483 168 500 202L632 548C639 562 628 576 612 576H92C76 576 65 562 72 548Z";

export const JIANSHAN_LOGO_SVG_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="700" viewBox="0 0 700 700"><circle cx="548" cy="164" r="46" fill="black"/><path d="${JIANSHAN_MOUNTAIN_PATH}" fill="black"/></svg>`;

export function PaseoLogo({ size = 64, color }: PaseoLogoProps) {
  const { theme } = useUnistyles();
  const fill = color ?? theme.colors.foreground;

  return (
    <Svg width={size} height={size} viewBox="0 0 700 700" fill="none">
      <Circle cx={548} cy={164} r={46} fill={fill} />
      <Path d={JIANSHAN_MOUNTAIN_PATH} fill={fill} />
    </Svg>
  );
}
