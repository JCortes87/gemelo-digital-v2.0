"""Tests de _extract_hrefs: extracción de enlaces del cuerpo de una página
HTML de contenido (para contar archivos enlazados como recursos educativos).
"""
from app.api.brightspace_proxy import _extract_hrefs


class TestExtractHrefs:
    def test_extrae_hrefs_simples(self):
        html = '<p><a href="/content/enforced/123/guia.pdf">Guía</a></p>'
        assert _extract_hrefs(html) == ["/content/enforced/123/guia.pdf"]

    def test_varios_enlaces_en_orden(self):
        html = (
            '<a href="/c/a.pdf">a</a>'
            "<a href='https://ejemplo.com/pagina'>b</a>"
            '<a href="/c/b.docx">c</a>'
        )
        assert _extract_hrefs(html) == [
            "/c/a.pdf", "https://ejemplo.com/pagina", "/c/b.docx",
        ]

    def test_decodifica_quicklinks_percent_encoded(self):
        # Los quicklinks de Brightspace codifican la ruta del archivo; sin
        # decodificar no se reconoce la extensión .pdf
        html = '<a href="/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=coursefile&fileId=docs%2Fguia%20final.pdf">x</a>'
        [href] = _extract_hrefs(html)
        assert "docs/guia final.pdf" in href

    def test_descarta_anclas_mailto_javascript_data_tel(self):
        html = (
            '<a href="#seccion">a</a>'
            '<a href="mailto:x@cesa.edu.co">b</a>'
            '<a href="javascript:void(0)">c</a>'
            '<a href="data:text/plain;base64,QQ==">d</a>'
            '<a href="tel:+571234">e</a>'
        )
        assert _extract_hrefs(html) == []

    def test_dedup_case_insensitive(self):
        html = '<a href="/c/A.pdf">a</a><a href="/c/a.pdf">b</a>'
        assert len(_extract_hrefs(html)) == 1

    def test_respeta_limite(self):
        html = "".join(f'<a href="/c/f{i}.pdf">x</a>' for i in range(200))
        assert len(_extract_hrefs(html)) == 100

    def test_html_vacio_o_none(self):
        assert _extract_hrefs("") == []
        assert _extract_hrefs(None) == []

    def test_atributos_con_espacios_y_comillas_simples(self):
        html = "<a class='x' href = '/c/mapa.png' >img</a>"
        assert _extract_hrefs(html) == ["/c/mapa.png"]
