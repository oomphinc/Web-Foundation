/**
 * Only work for Google Chrome.
 *
 * We're a bunch of Browser-ists.
 */
if(!window.chrome) {
	$('div').remove();

	$.ajax({
		url: 'tpl/chrome-only.html',
		success: function(html) {
			$('body').append(html);
		}
	});
}
