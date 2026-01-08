import { useState, useEffect, useMemo } from 'react';
import API from '../api';

function CallLog() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const fetchCalls = async () => {
      try {
        const res = await API.get('/api/calls', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setCalls(res.data || []);
      } catch {
        setError('Failed to load call logs');
      } finally {
        setLoading(false);
      }
    };
    fetchCalls();
  }, []);

  const filteredCalls = useMemo(() => {
    return calls.filter(c =>
      c.from?.includes(searchTerm) || c.to?.includes(searchTerm)
    );
  }, [calls, searchTerm]);

  const totalPages = Math.ceil(filteredCalls.length / itemsPerPage);
  const paginatedCalls = filteredCalls.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (loading) return <div style={{ padding: '2rem' }}>Loading…</div>;
  if (error) return <div style={{ padding: '2rem', color: 'red' }}>{error}</div>;

  return (
    <div style={{ padding: '2rem' }}>
      <input
        placeholder="Search…"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <table>
        <tbody>
          {paginatedCalls.map((c, i) => (
            <tr key={i}>
              <td>{c.from}</td>
              <td>{c.to}</td>
              <td>{new Date(c.createdAt).toLocaleString()}</td>
              <td>{c.status || 'Completed'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default CallLog;
