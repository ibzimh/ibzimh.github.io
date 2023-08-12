export default function FooterLinks() {
  return (
    <p className="flex justify-center mt-2 mb-3">
      <Link href="#about">About</Link>
      <Link href="#projects">Projects</Link>
    </p>
  );
}

function Link(props) {
  return (
    <a href={props.href} className="mx-2 hover:underline hover:text-slate-400">
      {props.children}
    </a>
  );
}
