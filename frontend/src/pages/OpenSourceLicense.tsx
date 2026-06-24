import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft, ChevronDown } from "lucide-react";

const licenses = [
  { name: "React", version: "18.3.1", license: "MIT", author: "Meta Platforms, Inc." },
  { name: "React Router", version: "7.x", license: "MIT", author: "Remix Software" },
  { name: "Vite", version: "6.x", license: "MIT", author: "Evan You" },
  { name: "Tailwind CSS", version: "4.x", license: "MIT", author: "Tailwind Labs" },
  { name: "Lucide React", version: "latest", license: "ISC", author: "Lucide Contributors" },
  { name: "FastAPI", version: "latest", license: "MIT", author: "Sebastián Ramírez" },
  { name: "SQLAlchemy", version: "latest", license: "MIT", author: "Mike Bayer" },
  { name: "Pydantic", version: "v2", license: "MIT", author: "Samuel Colvin" },
  { name: "Uvicorn", version: "latest", license: "BSD-3-Clause", author: "Tom Christie" },
  { name: "Python-Jose", version: "latest", license: "MIT", author: "mpdavis" },
  { name: "Passlib", version: "latest", license: "BSD", author: "Eli Collins" },
  { name: "Radix UI", version: "latest", license: "MIT", author: "WorkOS" },
  { name: "MUI", version: "7.x", license: "MIT", author: "MUI SAS" },
  { name: "Fluent UI Emoji", version: "latest", license: "MIT", author: "Microsoft Corporation" },
];

function getLicenseText(license: string, author: string) {
  if (license === "MIT") {
    return `MIT License\n\nCopyright (c) ${author}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;
  }
  if (license === "ISC") {
    return `ISC License\n\nCopyright (c) ${author}\n\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.\n\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`;
  }
  if (license.startsWith("BSD")) {
    return `BSD License\n\nCopyright (c) ${author}\n\nRedistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:\n\n1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.\n\n2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.\n\nTHIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.`;
  }
  return "";
}

export default function OpenSourceLicense() {
  const navigate = useNavigate();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-5 py-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5"
      >
        <ChevronLeft size={16} />
        뒤로 가기
      </button>

      <h1 className="text-2xl font-bold mb-2">오픈소스 라이선스</h1>
      <p className="text-sm text-muted-foreground mb-6">
        맘마케어는 아래의 오픈소스 소프트웨어를 사용합니다.
      </p>

      <div className="bg-card border border-border rounded-3xl overflow-hidden">
        <div className="divide-y divide-border">
          {licenses.map((lib, index) => (
            <div key={lib.name}>
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
              >
                <div className="text-left">
                  <div className="font-medium text-sm">{lib.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {lib.author}{lib.version ? ` · ver.${lib.version}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono bg-muted px-2.5 py-1 rounded-full text-muted-foreground">
                    {lib.license}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-muted-foreground transition-transform ${openIndex === index ? "rotate-180" : ""}`}
                  />
                </div>
              </button>
              {openIndex === index && (
                <div className="px-6 pb-5">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed bg-muted rounded-xl p-4">
                    {getLicenseText(lib.license, lib.author)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-6 text-center">
        각 라이브러리의 전체 라이선스 내용은 해당 프로젝트의 공식 저장소에서 확인하실 수 있습니다.
      </p>
    </div>
  );
}