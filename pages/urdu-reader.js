import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Navbar from '../components/navbar';
import Section from '../components/page_section';

export default function UrduReader() {
  const [text, setText] = useState('');
  const [dictionary, setDictionary] = useState([]); // Change to an array
  const [selectedWord, setSelectedWord] = useState('');
  const [definition, setDefinition] = useState(null); // Store the entire definition object
  const [showPopup, setShowPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    async function loadDictionary() {
      try {
        const response = await fetch('/dictionary.json');
        const data = await response.json();
        setDictionary(data); // Set the dictionary as an array
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

    // Find the word in the dictionary array
    let wordData = dictionary.find(item => item.urdu_no_diacritics === word);

    if (!wordData) {
      wordData = dictionary.find(item => item.roman === word);
    }

    if (wordData) {
      setSelectedWord(word);
      setDefinition(wordData); // Set the entire object as the definition
      const spanRect = e.currentTarget.getBoundingClientRect();
      // Position the popup directly next to the word
      const popupTop = spanRect.top + window.scrollY;
      const popupLeft = spanRect.left + window.scrollX;

      setPopupPosition({ top: popupTop, left: popupLeft });
      setShowPopup(true);
    } else {
      // Handle cases where the word isn't found
        setSelectedWord(word);
        setDefinition({ meaning: "Definition not found", synonyms: [] }); //Set to an object for consistency
        const spanRect = e.currentTarget.getBoundingClientRect();
        // Position the popup directly next to the word
        const popupTop = spanRect.top + window.scrollY;
        const popupLeft = spanRect.left + window.scrollX;
  
        setPopupPosition({ top: popupTop, left: popupLeft });
        setShowPopup(true);
    }
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
              className="w-full p-4 text-xl md:text-xl lg:text-2xl rounded-md border border-gray-700 bg-base-300 text-white urdu-font leading-relaxed md:leading-normal lg:leading-loose"
            />
          </div>

          <div
            dir="rtl"
            lang="ur"
            className="mt-5 whitespace-pre-wrap text-center text-xl md:text-2xl lg:text-3xl urdu-font leading-relaxed md:leading-normal lg:leading-loose"
            style={{ whiteSpace: 'pre-line' }} // This preserves newlines
          >
            {text.split(/\s+/).map((word, index) => {
              const cleanWord = word.replace(/[،.؟!]/g, '');
              const isSelected = showPopup && selectedWord === cleanWord;
              return (
                <span
                  key={index}
                  onClick={(e) => handleWordClick(e, cleanWord)}
                  className={`cursor-pointer inline-block mx-1 
                    ${isSelected ? 'text-[rgb(209,77,182)]' : 'text-white hover:text-[#f78166]'}
                    hover:-translate-y-1 transition-all duration-200`}
                  style={{ padding: '0 2px' }}
                >
                  {word}
                </span>
              )
            })}
          </div>

          {showPopup && definition && ( // Conditionally render based on definition
            <div
              className="absolute p-4 bg-base-300 border border-gray-700 rounded-md shadow-lg z-50 urdu-font"
              style={{
                top: `${popupPosition.top}px`,
                left: `${popupPosition.left}px`,
                fontFamily: 'inherit', // Use the same font
              }}
            >
              <div className="text-white">
                <strong>Word:</strong> {selectedWord}
              </div>
              <div className="text-white">
                <strong>Meaning:</strong> {definition.meaning}
              </div>
                {definition.synonyms && definition.synonyms.length > 0 && (
                    <div className="text-white">
                       <strong>Synonyms:</strong> {definition.synonyms.join(', ')}
                    </div>
                )}
              <button
                onClick={closePopup}
                className="mt-3 py-1.5 px-3 rounded-full shadow-[0_0_0_1px_rgb(255,255,255)] text-xs hover:bg-white hover:text-black duration-300 flex items-center justify-center"
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