export const Flash = ({ error }: { error?: string }) => error ? <p role="alert" className="alert-error mb-3">{error}</p> : null;
export const Empty = ({ children }: { children: React.ReactNode }) => <p className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600">{children}</p>;
export const Th = ({ children }: { children: React.ReactNode }) => <th scope="col" className="px-4 py-2 text-left font-medium text-gray-600">{children}</th>;
