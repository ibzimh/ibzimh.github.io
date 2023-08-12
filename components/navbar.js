import React, { Component } from "react";
import jump from "jump.js";

function NavItem(props) {
  const classNames = props.isMenu
    ? "btn btn-ghost text-mono text-xl my-2 w-full"
    : "btn btn-ghost mx-2 text-mono";

  return (
    <>
      <button
        className={classNames}
        onClick={() => {
          if (props.href.startsWith("#")) jump(props.href);
          else window.location.href = window.location.origin + "/" + props.href;
          window.location.hash = props.href.slice(1);
        }}
      >
        {props.text}
      </button>
      {props.isMenu ? <br /> : null}
    </>
  );
}

function NavEls(props) {
  return (
    <>
      <NavItem text="About" href="#about" isMenu={props.isMenu} />
      <NavItem text="Projects" href="#projects" isMenu={props.isMenu} />
    </>
  );
}

export default function Navbar() {
  return (
    <div className="fixed top-0 left-0 z-999 animate__animated animate__fadeInDown w-full">
      <div className="navbar bg-base-300 border-b-2 border-base-200 p-8 mb-8 flex justify-around">
        <h1 className="text-2xl font-mono text-base-content">Ibrahim Hasaan</h1>

        <div className="hidden md:block">
          <NavEls isMenu={false} />
        </div>
      </div>
    </div>
  );
}
