import type { ColorValue } from "react-native";
import Svg, { Path } from "react-native-svg";
import { withUniwind } from "uniwind";

const ThemedPath = withUniwind(Path);

export function T3Wordmark(props: {
  readonly height: number;
  readonly color?: ColorValue;
  readonly colorClassName?: string;
}) {
  const aspectRatio = 96 / 60.8;
  return (
    <Svg
      accessibilityLabel="Y3"
      height={props.height}
      width={props.height * aspectRatio}
      viewBox="16 34 96 60.8"
    >
      <ThemedPath
        d="M16 34H29.821L38 48.313L46.179 34H60L44 62V94H32V62ZM66 34H109V46L101.6 58.5H103C108.4 58.5 112 66.6 112 76.6C112 87.5 103.8 94.8 91.8 94.8C81.2 94.8 72.3 91.6 66 86L73.4 76.4C78.8 80.5 84.1 82.5 89 82.5H92C97.1 82.5 100 80.15 100 76.25C100 71.9 97.1 68.5 92 68.5H81.5V66.3L93.5 46H66Z"
        color={props.color}
        colorClassName={props.colorClassName}
        fill="currentColor"
      />
    </Svg>
  );
}
