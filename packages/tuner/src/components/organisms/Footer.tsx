interface FooterProps {
  message: string;
}

export function Footer({ message }: FooterProps) {
  return <div className="footer">{message}</div>;
}
