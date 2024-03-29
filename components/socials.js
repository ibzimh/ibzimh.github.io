function SocialLink(props) {
  return (
    <>
      <a
        href={props.href}
        aria-label={props.label}
        className="text-slate-300 hover:text-slate-50 duration-200 text-3xl m-3"
        target="_blank"
        rel="noreferrer"
      >
        {props.children}
      </a>
    </>
  );
}

export default function Socials() {
  return (
    <>
      <SocialLink href="https://github.com/ibzimh" label="GitHub">
        <i className="bi bi-github"></i>
      </SocialLink>
      <SocialLink href="https://www.linkedin.com/in/ibrahimhasaan/" label="Linkedin">
        <i className="bi bi-linkedin"></i>
      </SocialLink>
    </>
  );
}
