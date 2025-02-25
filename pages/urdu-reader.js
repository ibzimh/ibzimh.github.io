import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Navbar from '../components/navbar';
import Section from '../components/page_section';

export default function UrduReader() {
    const [text, setText] = useState('');
    const [dictionary, setDictionary] = useState({});
    const [selectedWord, setSelectedWord] = useState('');
    const [definition, setDefinition] = useState('');
    const [showPopup, setShowPopup] = useState(false);
    const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 }); // Initialize here

    useEffect(() => {
        async function loadDictionary() {
            try {
                const response = await fetch('/dictionary.json');
                const data = await response.json();
                setDictionary(data);
            } catch (error) {
                console.error("Failed to load dictionary:", error);
            }
        }
        loadDictionary();
    }, []);

    const handleTextChange = (e) => {
        setText(e.target.value);
    };

    const handleWordClick = (e, word) => {
        e.stopPropagation();

        const def = dictionary[word] || "Definition not found";
        setSelectedWord(word);
        setDefinition(def);

        const spanRect = e.currentTarget.getBoundingClientRect();

        // Calculate position *before* showing the popup
        const popupTop = spanRect.bottom + window.scrollY + 5;
        const popupLeft = spanRect.left + window.scrollX;

        setPopupPosition({ top: popupTop, left: popupLeft }); // Set position *before* showing
        setShowPopup(true); // Now show the popup
    };

    const closePopup = (e) => {
        e.stopPropagation();
        setShowPopup(false);
    };

    useEffect(() => {
        const handleDocumentClick = () => {
            if (showPopup) {
                setShowPopup(false);
            }
        };

        document.addEventListener("click", handleDocumentClick);

        return () => {
            document.removeEventListener("click", handleDocumentClick);
        };
    }, [showPopup]);

    return (
        <>
            <Head>
                <title>Urdu Reader with Dictionary</title>
                <meta name="description" content="Read Urdu text with dictionary lookup" />
                <meta charSet="utf-8" />
            </Head>

            <Navbar />

            <main className="animate__animated animate__fadeIn">
                <Section name="Urdu Reader">
                    <div className="text-center my-5">
                        <textarea
                            rows="10"
                            cols="50"
                            value={text}
                            onChange={handleTextChange}
                            placeholder="Enter Urdu text here..."
                            dir="rtl"
                            lang="ur"
                            className="w-full p-4 text-base rounded-md border border-gray-700 bg-base-300 text-white"
                        />
                    </div>

                    <div dir="rtl" lang="ur" className="mt-5 whitespace-pre-wrap text-center">
                        {text.split(/\s+/).map((word, index) => (
                            <span
                                key={index}
                                onClick={(e) => handleWordClick(e, word.replace(/[،.؟!]/g, ''))}
                                className="relative cursor-pointer mx-1 text-white hover:text-[#f78166]
                                           hover:-translate-y-1 transition-all duration-200"
                            >
                                {word}
                            </span>
                        ))}
                    </div>

                    {showPopup && (
                        <div
                            className="absolute p-4 bg-base-300 border border-gray-700 rounded-md shadow-lg z-50 text-white"
                            style={{
                                top: `${popupPosition.top}px`,
                                left: `${popupPosition.left}px`,
                            }}
                        >
                            <div>
                                <strong className="text-white">Word:</strong> {selectedWord}
                            </div>
                            <div>
                                <strong className="text-white">Definition:</strong> {definition}
                            </div>
                            <button
                                onClick={closePopup}
                                className="mt-3 py-1.5 px-3 rounded-full shadow-[0_0_0_1px_rgb(255,255,255)] text-xs hover:bg-white hover:text-black duration-300"
                            >
                                Close
                            </button>
                        </div>
                    )}
                </Section>
            </main>
        </>
    );
}