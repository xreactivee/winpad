import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  liquid?: boolean;
  solid?: boolean;
  frost?: boolean;
  radius?: number;
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
};

export function Glass({ liquid, solid, frost, radius, className = "", style, children, ...rest }: Props) {
  const css = { ...style, ...(radius !== undefined && { "--r": `${radius}px` }) } as CSSProperties;
  const cls = ["glass", liquid && "liquid", solid && "solid", frost && "frost", className].filter(Boolean).join(" ");
  return (
    <div className={cls} style={css} {...rest}>
      {children}
    </div>
  );
}
