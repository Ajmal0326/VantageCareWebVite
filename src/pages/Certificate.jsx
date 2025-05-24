import React from 'react';

const Certificate = () => {
  const certificates = [
    {
      name: 'First Aid Certificate',
      uploadDate: '20 May 2025',
      expiryDate: '30 June 2025',
      status: 'Pending',
    },
    {
      name: 'Police Check',
      uploadDate: '27 April 2025',
      expiryDate: '12 Sep 2025',
      status: 'Active',
    },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <h2 className="text-xl sm:text-2xl font-semibold mb-1">Upload your certifications</h2>
      <p className="text-sm mb-6 text-gray-700">
        Accepted format: <strong>PDF, JPEG, PNG</strong>, Max size: <strong>5MB</strong>
      </p>

      <div className="bg-blue-700 text-white p-6 rounded-md text-center mb-6">
        <div className="text-4xl mb-2">☁️</div>
        <p className="mb-2 text-base">Drop files here or click to upload</p>
        <button className="bg-blue-900 px-4 py-2 rounded hover:bg-blue-800 transition">
          Upload Certificate
        </button>
      </div>

      <div className="bg-blue-800 text-white text-center p-2 rounded mb-4 text-sm">
        Ensure certifications are up to date before your next shift.
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-blue-700 text-white rounded overflow-hidden text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3">Certificate Name</th>
              <th className="px-4 py-3">Upload Date</th>
              <th className="px-4 py-3">Expiry Date</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {certificates.map((cert, idx) => (
              <tr key={idx} className="border-t border-blue-600">
                <td className="px-4 py-2">{cert.name}</td>
                <td className="px-4 py-2">{cert.uploadDate}</td>
                <td className="px-4 py-2">{cert.expiryDate}</td>
                <td className="px-4 py-2">
                  <span
                    className={`px-2 py-1 text-sm font-medium ${
                      cert.status === 'Active'
                        ? 'text-white-800'
                        : 'text-white-800'
                    }`}
                  >
                    {cert.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Certificate;
