// pages/urdu-reader.js
import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function UrduReader() {
  const [text, setText] = useState('');
  const [dictionary, setDictionary] = useState({});
  const [selectedWord, setSelectedWord] = useState('');
  const [definition, setDefinition] = useState('');
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const [showPopup, setShowPopup] = useState(false);

  // Load dictionary from local JSON file
  useEffect(() => {
    async function loadDictionary() {
      try {
        // Assuming your dictionary is in the public folder
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
    // Get word definition from dictionary
    const def = dictionary[word] || "Definition not found";
    setSelectedWord(word);
    setDefinition(def);
    
    // Calculate position for popup
    const rect = e.target.getBoundingClientRect();
    setPopupPosition({
      top: rect.bottom + window.scrollY,
      left: rect.left + window.scrollX
    });
    
    setShowPopup(true);
  };

  const closePopup = () => {
    setShowPopup(false);
  };

  return (
    <div>
      <Head>
        <title>Urdu Reader with Dictionary</title>
        <meta name="description" content="Read Urdu text with dictionary lookup" />
        <meta charSet="utf-8" />
      </Head>

      <main>
        <h1>Urdu Reader</h1>
        
        <div>
          <textarea
            rows="10"
            cols="50"
            value={text}
            onChange={handleTextChange}
            placeholder="Enter Urdu text here..."
            dir="rtl"
            lang="ur"
          />
        </div>
        
        <div dir="rtl" lang="ur" style={{ marginTop: '20px', whiteSpace: 'pre-wrap' }}>
          {text.split(/\s+/).map((word, index) => (
            <span 
              key={index} 
              onClick={(e) => handleWordClick(e, word.replace(/[،.؟!]/g, ''))}
              style={{ cursor: 'pointer', margin: '0 4px' }}
            >
              {word}
            </span>
          ))}
        </div>
        
        {showPopup && (
          <div 
            style={{
              position: 'absolute',
              top: `${popupPosition.top}px`,
              left: `${popupPosition.left}px`,
              padding: '10px',
              backgroundColor: 'white',
              border: '1px solid black',
              borderRadius: '5px',
              zIndex: 100,
              boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
            }}
          >
            <div>
              <strong>Word:</strong> {selectedWord}
            </div>
            <div>
              <strong>Definition:</strong> {definition}
            </div>
            <button onClick={closePopup}>Close</button>
          </div>
        )}
      </main>
    </div>
  );
}