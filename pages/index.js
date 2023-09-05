import React from "react";
import Head from "next/head";
import Script from "next/script";
import Navbar from "../components/navbar.js"; // TODO: Check this page
import Section from "../components/page_section.js"; // TODO: Check this page
import ParticleBackground from "../components/particle_background.js"; // TODO: Check this page
import Socials from "../components/socials.js"; // TODO: Check this page
import ProjectCard from "../components/project_card.js"; // TODO: Check this page
import Copyright from "../components/copyright.js";
import FooterLinks from "../components/footer_links.js"; // TODO: Check this page

import "animate.css";
import "bootstrap-icons/font/bootstrap-icons.css";

export default function Home({ encodedEmail, emailKey }) {
  return (
    <>
      {/* TODO: Check the CSS here */}
      <div className="animate__animated animate__fadeIn">
        <Head>
          <title>Ibrahim Hasaan</title>
        </Head>

        <Navbar />

        <ParticleBackground />

        {/* Set margin top to 100vh to offset from the background that is positioned absolutely. */}
        <div className="mt-[100vh]">
          <div className="divider"></div>
          <Section name="About">
            <h3 className="font-extrabold">Hey there!</h3>
            <p>
              I&apos;m a Computer Science and Mathematics Major graduating in
              Spring 2024 and I&apos;m looking for an Internship and/or a Job!
            </p> <br />
            {/* TODO: Remove under construction text */}
            <p> 
              (This page is under construction btw!)
            </p>
          </Section>
        </div>

        <div className="divider"></div>

        <Section name="Projects">
          <p className="p-6 m-3">
            Here are some of my projects that I have worked on. To view them all, please refer to
            <a href="https://github.com/ibzimh?tab=repositories&q=&type=&language=&sort=stargazers" className="hover:underline" target="_blank" rel="noreferrer">
              my GitHub page
            </a>
            .
          </p>
          {/* TODO: Update Projects */}
          <div className="pt-8">
            <ProjectCard projectName="Professor Ratings for Spire + API" href="https://github.com/ibzimh/Professor-Ratings-for-Spire">
              An API that provides any professor's ratemyprofessor rating and a tampermonkey script that imports professor ratings from ratemyprofessor.com to the university course selection website.
            </ProjectCard>
            <ProjectCard projectName="Open Course Notifier" href="https://github.com/ibzimh/Open-Seat-Notifier">
              A project to notify students when a seat becomes available in a class, reducing the need for manual checks.
            </ProjectCard>
            <ProjectCard projectName="Conversational AI Toolkit" href="https://github.com/ibzimh">
              Script for extending the functionality of an AI chat website by adding multiple quality-of-life features like generating multiple messages at once, auto-generation mechanism to handle unwanted or unhelpful responses, auto-rating responses based on forbidden keywords allows injecting information to help restore bot memory.
            </ProjectCard>
            <ProjectCard projectName="Portfolio Website" href="https://github.com/ibzimh/ibzimh.github.io">
              A portfolio website to showcase projects to prospective employers.
            </ProjectCard>
            <ProjectCard projectName="Resolution-Preserving Image Compression" href="https://github.com/ibzimh">
              A machine learning based image compression algorithm that achives upto 40% reduction in image file size while preserving the image&apos;s resolution.
            </ProjectCard>
          </div>
        </Section>

        {/* TODO: check out the divider code */}
        <div className="divider"></div>

        <div className="px-8 mx-4 -mt-48">
          <p className="mt-64 flex justify-center">
            <Socials />
          </p>

          <FooterLinks />

          {/* TODO: Remove the copyright */}
          <Copyright />
        </div>
      </div>

      {/* TODO: Find out what these guys do */}
      <Script src="scripts/particles.min.js" strategy="beforeInteractive" />
      <Script src="scripts/particles_init.js" />

      {/* TODO: Analytics was here, do I need it?? */}
    </>
  );
}
