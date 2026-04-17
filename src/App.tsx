import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileText, Play, Download, Loader2, Volume2, Settings2, Moon, Sun, Eye } from 'lucide-react';
import { GoogleGenAI, Modality } from '@google/genai';
import * as pdfjsLib from 'pdfjs-dist';
import { base64ToUint8Array, pcmToWavBlob } from './lib/audio';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.mjs`;

const VOICE_MAPPINGS = [
  // الأصوات البشرية
  { uid: 'h_man', realId: 'Charon', name: 'رجل', desc: 'صوت بشري عميق ووقور' },
  { uid: 'h_woman', realId: 'Kore', name: 'امرأة', desc: 'صوت بشري هادئ وواضح' },
  { uid: 'h_young_man', realId: 'Fenrir', name: 'شاب', desc: 'صوت بشري قوي وحيوي' },
  { uid: 'h_young_woman', realId: 'Zephyr', name: 'شابة', desc: 'صوت بشري رقيق ودافئ' },
  { uid: 'h_boy', realId: 'Puck', name: 'طفل (ولد)', desc: 'صوت طفولي نشط ومرح' },
  { uid: 'h_girl', realId: 'Zephyr', name: 'طفلة (بنت)', desc: 'صوت طفولي ناعم وبريء' },
  
  // أصوات بأسلوب الذكاء الاصطناعي/آلية
  { uid: 'a_man', realId: 'Charon', name: 'ذكاء اصطناعي (رجل)', desc: 'نبرة آلية رسمية' },
  { uid: 'a_woman', realId: 'Kore', name: 'ذكاء اصطناعي (امرأة)', desc: 'نبرة آلية متزنة' },
  { uid: 'a_young_man', realId: 'Fenrir', name: 'ذكاء اصطناعي (شاب)', desc: 'نبرة تفاعلية سريعة' },
  { uid: 'a_child', realId: 'Puck', name: 'ذكاء اصطناعي (طفل/مساعد آلي)', desc: 'مساعد مرن ولطيف' }
];

const DIALECTS = [
  { id: 'auto', name: 'تلقائي (حسب النص المكتوب)', promptName: '' },
  { id: 'ar-standard', name: 'العربية الفصحى', promptName: 'Standard Arabic' },
  { id: 'ar-egyptian', name: 'اللهجة المصرية', promptName: 'Egyptian Arabic' },
  { id: 'ar-saudi', name: 'اللهجة السعودية (الخليجية)', promptName: 'Saudi Arabic' },
  { id: 'ar-emirati', name: 'اللهجة الإماراتية (الخليجية)', promptName: 'Emirati Arabic' },
  { id: 'ar-kuwaiti', name: 'اللهجة الكويتية (الخليجية)', promptName: 'Kuwaiti Arabic' },
  { id: 'ar-qatari', name: 'اللهجة القطرية (الخليجية)', promptName: 'Qatari Arabic' },
  { id: 'ar-omani', name: 'اللهجة العمانية (الخليجية)', promptName: 'Omani Arabic' },
  { id: 'ar-bahraini', name: 'اللهجة البحرينية (الخليجية)', promptName: 'Bahraini Arabic' },
  { id: 'ar-levantine', name: 'اللهجة الشامية', promptName: 'Levantine Arabic' },
  { id: 'ar-maghrebi', name: 'اللهجة المغربية', promptName: 'Maghrebi Arabic' },
  { id: 'ar-algerian', name: 'اللهجة الجزائرية', promptName: 'Algerian Arabic' },
  { id: 'en-us', name: 'الإنجليزية (الأمريكية)', promptName: 'American English' },
  { id: 'en-gb', name: 'الإنجليزية (البريطانية)', promptName: 'British English' },
  { id: 'fr', name: 'الفرنسية', promptName: 'French' },
  { id: 'es', name: 'الإسبانية', promptName: 'Spanish' },
  { id: 'de', name: 'الألمانية', promptName: 'German' },
  { id: 'custom', name: 'لغة أو لهجة أخرى (كتابة يدوية)...', promptName: 'custom' },
];

export default function App() {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(VOICE_MAPPINGS[1].uid); // default Kore
  const [selectedDialect, setSelectedDialect] = useState(DIALECTS[0].id); // default auto
  const [customDialect, setCustomDialect] = useState('');
  const [speed, setSpeed] = useState<number>(1.1);
  const [pitch, setPitch] = useState<number>(0);
  const [theme, setTheme] = useState<'dark' | 'light' | 'sepia'>('dark');
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [progressStatus, setProgressStatus] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  React.useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed, audioUrl]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      setProgressStatus(`Extracting text from ${file.name}...`);
      
      let extractedText = '';
      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        const limit = Math.min(pdf.numPages, 10); // Limit to first 10 pages for TTS to avoid huge payload
        for (let i = 1; i <= limit; i++) {
          setProgressStatus(`Parsing PDF page ${i} of ${limit}...`);
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + '\\n';
        }
        extractedText = fullText;
        if (pdf.numPages > 10) {
          extractedText += '\\n... (Text truncated after 10 pages)';
        }
      } else {
         extractedText = await file.text();
         // simple truncation if txt is huge
         if (extractedText.length > 25000) {
           extractedText = extractedText.substring(0, 25000) + '... (truncated)';
         }
      }

      setText(extractedText.trim() === '' ? 'No readable text found.' : extractedText);
    } catch (err: any) {
      alert(`Error reading file: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setProgressStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGenerateAudio = async () => {
    if (!text.trim()) {
      alert('Please enter or upload some text first.');
      return;
    }

    try {
      setIsProcessing(true);
      setProgressStatus('Generating audio with AI... This may take a moment.');
      if (audioUrl) {
         URL.revokeObjectURL(audioUrl);
         setAudioUrl(null);
      }

      const actualApiVoiceId = VOICE_MAPPINGS.find(v => v.uid === selectedVoice)?.realId || 'Kore';
      
      let finalPromptText = text.substring(0, 4800);
      let promptModifiers = [];

      // Add deep contextual instructions to force ultra-natural human performance vs robotic
      if (selectedVoice.startsWith('h_')) {
          let persona = "a professional human voice actor";
          if (selectedVoice === 'h_boy') persona = "a young human boy (child around 8 years old) with a natural, bright, and energetic child's voice";
          else if (selectedVoice === 'h_girl') persona = "a young human girl (child around 8 years old) with a natural, sweet, and expressive child's voice";
          else if (selectedVoice === 'h_man') persona = "a mature adult human man";
          else if (selectedVoice === 'h_woman') persona = "a mature adult human woman";
          else if (selectedVoice === 'h_young_man') persona = "a young adult human man";
          else if (selectedVoice === 'h_young_woman') persona = "a young adult human woman";

          promptModifiers.push(`act as ${persona}. CRITICAL INSTRUCTION: First, deeply analyze the text to understand its core emotion, context, and intent (e.g., anger, sadness, joy, explanation, urgency). Then, strictly adapt your vocal tone, pitch, pacing, and emotional expression to perfectly match the feeling of the text. Use natural pauses, authentic emotion, and perfect conversational prosody exactly matching a real ${persona.split(' (')[0]}`);
      } else if (selectedVoice.startsWith('a_')) {
          promptModifiers.push(`speak strictly in a formal, structured, clear, and robotic AI assistant tone without varied human emotion`);
      }

      if (selectedDialect !== 'auto') {
         if (selectedDialect === 'custom' && customDialect.trim() !== '') {
            promptModifiers.push(`CRITICAL: You MUST perfectly emulate the localized pronunciation, vocabulary nuances, and exact phonetic accent of "${customDialect.trim()}" native speakers without falling back to standard dialects`);
         } else if (selectedDialect !== 'custom') {
            const dialectName = DIALECTS.find(d => d.id === selectedDialect)?.promptName;
            if (dialectName) promptModifiers.push(`CRITICAL: You MUST perfectly emulate the localized pronunciation, vocabulary nuances, and exact phonetic accent of authentic native "${dialectName}" speakers`);
         }
      }

      if (pitch <= -2) promptModifiers.push(`use a very deep, low-pitched voice`);
      else if (pitch === -1) promptModifiers.push(`use a slightly deeper voice`);
      else if (pitch === 1) promptModifiers.push(`use a slightly higher-pitched voice`);
      else if (pitch >= 2) promptModifiers.push(`use a very high-pitched, sharp voice`);

      if (speed >= 1.5 && speed < 2.0) promptModifiers.push(`speak briskly and at a fast pace`);
      else if (speed >= 2.0) promptModifiers.push(`speak very rapidly and urgently`);

      const systemInstruction = promptModifiers.length > 0 
          ? `Instructions for voice output: ${promptModifiers.join(' and ')}.`
          : undefined;

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: finalPromptText }] }], // Safe content limit for TTS
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: systemInstruction,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: actualApiVoiceId },
            },
          },
        },
      });

      const candidate = response.candidates?.[0];
      
      if (candidate?.finishReason === 'SAFETY') {
        throw new Error('Blocked by safety filters. Please try modifying the text.');
      }

      // Find the audio part correctly instead of assuming index 0
      const audioPart = candidate?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('audio/'));
      const base64Audio = audioPart?.inlineData?.data;
      
      if (!base64Audio) {
        throw new Error('No audio data received from API. Ensure your text is safe and the language is supported.');
      }

      setProgressStatus('Processing audio format...');
      const pcmData = base64ToUint8Array(base64Audio);
      const wavBlob = pcmToWavBlob(pcmData, 24000, 1);
      const newAudioUrl = URL.createObjectURL(wavBlob);
      
      setAudioUrl(newAudioUrl);
    } catch (err: any) {
      console.error(err);
      alert(`Error generating audio: ${err.message || 'Unknown error occurred.'}`);
    } finally {
      setIsProcessing(false);
      setProgressStatus('');
    }
  };

  return (
    <div className="h-screen bg-bg-deep text-text-primary font-sans flex flex-col overflow-hidden" dir="rtl">
      
      {/* Top Bar / Brand */}
      <header className="px-10 py-6 flex items-center justify-between border-b border-border bg-bg-panel shrink-0">
        <div className="font-serif text-[28px] italic text-accent tracking-wider">VoxAura</div>
        <div className="flex gap-6 text-sm text-text-secondary items-center">
          <div className="flex bg-bg-deep rounded-full p-1 border border-border mr-4">
             <button title="داكن (الليلة)" onClick={() => setTheme('dark')} className={`p-2 rounded-full transition-all ${theme === 'dark' ? 'bg-accent text-bg-deep' : 'hover:text-text-primary'}`}>
                <Moon className="w-4 h-4" />
             </button>
             <button title="المريح للعين" onClick={() => setTheme('sepia')} className={`p-2 rounded-full transition-all ${theme === 'sepia' ? 'bg-accent text-bg-deep' : 'hover:text-text-primary'}`}>
                <Eye className="w-4 h-4" />
             </button>
             <button title="مضيء (الصباح)" onClick={() => setTheme('light')} className={`p-2 rounded-full transition-all ${theme === 'light' ? 'bg-accent text-bg-deep' : 'hover:text-text-primary'}`}>
                <Sun className="w-4 h-4" />
             </button>
          </div>
          <span className="text-accent cursor-pointer">تحويل النص إلى صوت</span>
          <span className="hover:text-text-primary cursor-pointer transition-colors hidden md:inline">مكتبة الملفات</span>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] min-h-0">
        
        {/* Left Side: Conversion Area */}
        <main className="p-10 flex flex-col gap-8 h-full overflow-y-auto">
          <div className="mb-2 shrink-0">
              <h1 className="font-serif text-[32px] font-normal mb-2">تحويل النص</h1>
              <p className="text-sm text-text-secondary">قم بلصق النص الخاص بك أو رفع ملف PDF للبدء في التحويل الصوتي عالي الجودة.</p>
          </div>

          <div className="flex-1 bg-bg-panel border border-border rounded-lg p-8 relative flex flex-col min-h-[300px]">
             <textarea 
                className="w-full h-full bg-transparent border-none text-text-primary text-[18px] leading-[1.6] resize-none outline-none font-serif pb-24"
                placeholder="ابدأ الكتابة هنا أو الصق النص..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={isProcessing}
             />
             
             {/* Drop Zone */}
             <div className="absolute bottom-5 left-5 right-5 border border-dashed border-border rounded-md p-5 text-center text-[13px] text-text-secondary bg-white/5 transition-colors hover:bg-white/10">
                <input 
                    type="file" 
                    accept=".pdf,.txt" 
                    onChange={handleFileUpload}
                    ref={fileInputRef}
                    className="hidden"
                    id="file-upload"
                    disabled={isProcessing}
                  />
                <label htmlFor="file-upload" className="cursor-pointer flex items-center justify-center gap-2 w-full h-full">
                  <FileText className="w-4 h-4" />
                  اسحب ملفات PDF أو TXT هنا أو <strong className="text-text-primary font-medium mx-1">اختر من جهازك</strong>
                </label>
             </div>
          </div>

          <div className="flex gap-4 mt-auto shrink-0">
             <button
               onClick={handleGenerateAudio}
               disabled={isProcessing || !text.trim()}
               className="flex-1 px-4 py-3.5 bg-accent text-bg-deep rounded font-semibold text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all"
             >
                {isProcessing ? (
                   <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {progressStatus || 'جاري المعالجة...'}
                   </>
                ) : (
                   <>
                      <Play className="w-4 h-4 fill-current" />
                      توليد الصوت الآن
                   </>
                )}
             </button>
             
             {audioUrl && (
               <a 
                 href={audioUrl} 
                 download={`speech_${selectedVoice.toLowerCase()}_${new Date().getTime()}.wav`}
                 className="flex-1 px-4 py-3.5 border border-border text-text-primary rounded font-semibold text-sm flex items-center justify-center gap-2 hover:bg-white/5 transition-colors active:scale-[0.98]"
               >
                 <Download className="w-4 h-4" />
                 تنزيل ملف الصوت (WAV)
               </a>
             )}
          </div>
        </main>

        {/* Right Side: Control Panel */}
        <aside className="bg-bg-panel border-r border-border p-10 flex flex-col h-full overflow-y-auto w-full">
          <span className="text-[11px] uppercase tracking-[2px] text-text-secondary mb-5 block">
             اختر صوت المتحدث
          </span>
          
          <div className="flex flex-col gap-3">
            {VOICE_MAPPINGS.map(v => (
               <div 
                 key={v.uid} 
                 onClick={() => !isProcessing && setSelectedVoice(v.uid)}
                 className={`p-4 rounded-lg cursor-pointer border ${selectedVoice === v.uid ? 'border-accent bg-white/5' : 'border-border bg-white/[0.03] hover:border-gray-600'} transition-colors`}
               >
                  <span className="font-medium text-[15px] block mb-1 text-text-primary">{v.name}</span>
                  <span className="text-xs text-text-secondary">{v.desc}</span>
               </div>
            ))}
          </div>

          {/* Dialect / Language Settings */}
          <div className="mt-10">
             <span className="text-[11px] uppercase tracking-[2px] text-text-secondary mb-3 block">
                اللغة أو اللهجة
             </span>
             <select
                className="w-full bg-bg-deep border border-border text-text-primary rounded-lg px-4 py-3 focus:outline-none focus:border-accent transition-colors text-[14px] cursor-pointer"
                value={selectedDialect}
                onChange={(e) => setSelectedDialect(e.target.value)}
                disabled={isProcessing}
             >
                {DIALECTS.map(d => (
                   <option key={d.id} value={d.id}>{d.name}</option>
                ))}
             </select>
             
             {selectedDialect === 'custom' && (
               <input 
                 type="text"
                 className="w-full bg-bg-deep border border-border mt-3 text-text-primary rounded-lg px-4 py-3 focus:outline-none focus:border-accent transition-colors text-[14px]"
                 placeholder="اكتب اللغة (مثال: الهندية، اليابانية، الصعيدية...)"
                 value={customDialect}
                 onChange={(e) => setCustomDialect(e.target.value)}
                 disabled={isProcessing}
               />
             )}
          </div>

          <div className="mt-10 grid gap-5 border-t border-border pt-8">
             <span className="text-[11px] uppercase tracking-[2px] text-text-secondary mb-1 block">
                إعدادات الصوت
             </span>
             
             {/* Speed Slider */}
             <div className="flex justify-between items-center text-[13px] gap-4">
                <span className="w-16">السرعة</span>
                <input 
                   type="range" min="0.25" max="3.0" step="0.1" 
                   value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))}
                   className="flex-1 accent-accent cursor-pointer" dir="ltr"
                />
                <span className="text-[11px] text-accent w-8 text-left" dir="ltr">{speed.toFixed(1)}x</span>
             </div>
             
             {/* Pitch Slider */}
             <div className="flex justify-between items-center text-[13px] gap-4">
                <span className="w-16">نغمة الصوت</span>
                <input 
                   type="range" min="-2" max="2" step="1" 
                   value={pitch} onChange={(e) => setPitch(parseInt(e.target.value))}
                   className="flex-1 accent-accent cursor-pointer" dir="ltr"
                />
                <span className="text-[11px] text-accent w-8 text-left" dir="ltr">
                   {pitch === 0 ? 'عادي' : pitch > 0 ? `+${pitch}` : pitch}
                </span>
             </div>
          </div>
        </aside>

      </div>
      
      {/* Bottom Player Bar */}
      {audioUrl && (
        <div className="h-[80px] bg-player-bg border-t border-border flex items-center px-10 gap-[30px] shrink-0 z-20 animate-in slide-in-from-bottom-5">
           <div className="w-11 h-11 bg-accent rounded-full flex items-center justify-center text-bg-deep shrink-0 shadow-[0_0_15px_rgba(197,164,126,0.3)]">
              <Play className="w-5 h-5 ml-1 fill-current" />
           </div>
           
           <div className="flex-1">
              {/* Native audio player */}
              <audio ref={audioRef} controls src={audioUrl} className="w-full h-10 outline-none" dir="ltr" />
           </div>
        </div>
      )}
    </div>
  );
}
