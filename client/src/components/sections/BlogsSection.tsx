import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api';

interface Blog {
  _id: string;
  title: string;
  description: string;
  youtubeUrl?: string;
  thumbnailUrl?: string;
  createdAt: string;
}

const BlogsSection: React.FC = () => {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBlogs = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/blogs`);
        setBlogs(res.data.blogs || []);
      } catch (_error) {
        setBlogs([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBlogs();
  }, []);

  return (
    <section id="blogs" className="py-16 md:py-24 bg-white">
      <div className="container mx-auto">
        <div className="section-title">
          <h2>Latest Blogs</h2>
          <p>Insights, strategy and exam guidance from Eyeconic mentors.</p>
        </div>

        {loading ? (
          <div className="text-center text-gray-500">Loading blogs...</div>
        ) : blogs.length === 0 ? (
          <div className="max-w-3xl mx-auto rounded-xl border border-teal-100 bg-teal-50 px-6 py-8 text-center text-teal-900">
            Blogs are coming soon.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {blogs.map((blog) => {
              const hasThumbnail = Boolean(blog.thumbnailUrl);
              return (
                <article
                  key={blog._id}
                  className="overflow-hidden rounded-2xl border border-teal-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="aspect-video w-full bg-teal-100">
                    {hasThumbnail ? (
                      <img
                        src={blog.thumbnailUrl}
                        alt={blog.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal-200 to-cyan-100 px-6 text-center text-lg font-semibold text-teal-900">
                        {blog.title}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-teal-600">
                      {new Date(blog.createdAt).toLocaleDateString()}
                    </p>
                    <h3 className="text-xl font-bold leading-snug text-gray-900">{blog.title}</h3>
                    <p className="line-clamp-4 text-sm leading-6 text-gray-600">{blog.description}</p>
                    {blog.youtubeUrl && (
                      <a
                        href={blog.youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
                      >
                        Watch on YouTube
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default BlogsSection;
